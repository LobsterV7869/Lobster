/**
 * Helper to reply with a rendered canvas card.
 * @module canvas/send
 */

const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { renderCard } = require('./index');

/**
 * Reply to an interaction or message with a canvas card.
 * Falls back to a simple embed on render/send errors.
 *
 * @param {import('discord.js').Interaction|object} context - interaction or message-like context
 * @param {string} type - card type
 * @param {object} data - card data
 * @param {{ ephemeral?: boolean, fallbackContent?: string, fileName?: string }} [opts]
 * @returns {Promise<any>}
 */
async function replyWithCard(context, type, data = {}, opts = {}) {
  const { ephemeral = false, fallbackContent, fileName = 'card.png' } = opts;
  const interaction = context?.isChatInputCommand ? context : (context?.interaction || null);
  const message = context?.reply && !context?.isChatInputCommand ? context : (context?.message || null);

  try {
    if (interaction && !interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral }).catch(() => {});
    }

    const buffer = await renderCard(type, data);
    const attachment = new AttachmentBuilder(buffer, { name: fileName });
    const payload = { files: [attachment], ephemeral: !!ephemeral };

    if (interaction) {
      if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
      return interaction.reply(payload);
    }
    if (message?.reply) return message.reply(payload);
    if (context?.channel?.send) return context.channel.send(payload);
    throw new Error('No valid reply target');
  } catch (error) {
    console.error(`[canvas/send] Failed to render/send ${type} card:`, error?.message || error);
    // fallback
    const embed = new EmbedBuilder()
      .setColor(0xFF5A4F)
      .setTitle(String(data?.title || 'Lobster'))
      .setDescription(String(data?.description || fallbackContent || 'Something went wrong while rendering this response.'))
      .setTimestamp();
    try {
      if (interaction) {
        const p = { embeds: [embed], ephemeral: !!ephemeral };
        if (interaction.deferred || interaction.replied) return interaction.editReply(p);
        return interaction.reply(p);
      }
      if (message?.reply) return message.reply({ embeds: [embed] });
    } catch (e) {
      console.error('[canvas/send] Fallback also failed:', e?.message);
    }
    return null;
  }
}

module.exports = { replyWithCard };
