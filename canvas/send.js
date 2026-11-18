/**
 * Helper to reply with a rendered canvas card.
 * Supports both slash Interactions and prefix Messages.
 * @module canvas/send
 */

const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { renderCard } = require('./index');

function resolveTarget(target) {
  if (!target) return { interaction: null, message: null };
  // Full handler context { interaction, message, ... }
  if (target.interaction || target.message) {
    return {
      interaction: target.interaction || null,
      message: target.message || null,
    };
  }
  // Direct interaction
  if (typeof target.isChatInputCommand === 'function' || typeof target.editReply === 'function' || target.deferred !== undefined && target.commandId !== undefined) {
    return { interaction: target, message: null };
  }
  // Direct message
  if (target.author && (typeof target.reply === 'function' || target.channel)) {
    return { interaction: null, message: target };
  }
  // Fallback heuristics
  if (target.channel && typeof target.reply === 'function') return { interaction: null, message: target };
  return { interaction: null, message: null };
}

function buildFallbackEmbed(data = {}, fallbackContent) {
  return new EmbedBuilder()
    .setColor(0xFF5A4F)
    .setTitle(String(data?.title || 'Lobster'))
    .setDescription(String(data?.description || fallbackContent || 'Something went wrong while rendering this response.'))
    .setTimestamp();
}

async function sendFallback(interaction, message, data, opts = {}) {
  const { ephemeral = false, fallbackContent } = opts;
  const embed = buildFallbackEmbed(data, fallbackContent);
  try {
    if (interaction) {
      const p = { embeds: [embed], ephemeral: !!ephemeral };
      if (interaction.deferred || interaction.replied) return await interaction.followUp(p).catch(() => interaction.editReply(p).catch(() => null));
      return await interaction.reply(p).catch(() => null);
    }
    if (message) {
      return await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(async () => {
        if (message.channel?.send) return message.channel.send({ embeds: [embed] }).catch(() => null);
        return null;
      });
    }
  } catch (e) {
    console.error('[canvas/send] Fallback also failed:', e?.message || e);
  }
  return null;
}

/**
 * Reply to an interaction or message with a canvas card.
 * Falls back to a simple embed on render/send errors. Never throws.
 *
 * @param {import('discord.js').Interaction|import('discord.js').Message|object} target
 * @param {string} type
 * @param {object} data
 * @param {{ ephemeral?: boolean, fallbackContent?: string, fileName?: string }} [opts]
 * @returns {Promise<any>}
 */
async function replyWithCard(target, type, data = {}, opts = {}) {
  const { ephemeral = false, fileName = 'card.png' } = opts;
  const { interaction, message } = resolveTarget(target);

  try {
    if (interaction && !interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral }).catch(() => {});
    }

    const buffer = await renderCard(type, data);
    const attachment = new AttachmentBuilder(buffer, { name: fileName });
    const payload = { files: [attachment] };

    if (interaction) {
      if (interaction.deferred || interaction.replied) {
        // editReply replaces deferred response; if already replied with a non-deferred message, followUp
        return await interaction.editReply(payload).catch(async () => interaction.followUp({ ...payload, ephemeral: !!ephemeral }).catch(() => null));
      }
      return await interaction.reply({ ...payload, ephemeral: !!ephemeral }).catch(async () => interaction.followUp({ ...payload, ephemeral: !!ephemeral }).catch(() => null));
    }

    if (message) {
      return await message.reply({ ...payload, allowedMentions: { repliedUser: false } }).catch(async () => {
        if (message.channel?.send) return message.channel.send(payload).catch(() => null);
        return null;
      });
    }

    console.error(`[canvas/send] No valid reply target for ${type}`);
    return null;
  } catch (error) {
    console.error(`[canvas/send] Failed to render/send ${type} card:`, error?.message || error);
    return sendFallback(interaction, message, data, opts);
  }
}

module.exports = { replyWithCard };
