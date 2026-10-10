function memberHierarchyError(actor, target, guild) {
  if (target.id === actor.id) return 'You cannot use this command on yourself.';
  if (target.id === guild.ownerId) return 'The server owner cannot be moderated.';
  if (!target.manageable) return 'I cannot moderate that member because of their role or server ownership.';
  if (actor.id !== guild.ownerId && target.roles.highest.comparePositionTo(actor.roles.highest) >= 0) {
    return 'You cannot moderate a member with an equal or higher role.';
  }
  return null;
}

function roleHierarchyError(actor, role, guild) {
  if (role.id === guild.id || role.managed) return 'That role cannot be assigned or removed.';
  if (!role.editable) return 'I cannot manage that role because it is above my highest role.';
  if (actor.id !== guild.ownerId && role.comparePositionTo(actor.roles.highest) >= 0) {
    return 'You cannot manage a role equal to or above your highest role.';
  }
  return null;
}

module.exports = { memberHierarchyError, roleHierarchyError };
