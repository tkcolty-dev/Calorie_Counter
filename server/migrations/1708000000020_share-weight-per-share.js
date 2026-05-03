exports.up = (pgm) => {
  // Per-share override for weight visibility. NULL = fall back to the
  // owner's global 'share-weight' user_setting (which keeps existing
  // behavior intact for users who haven't customized per person).
  pgm.addColumn('shares', {
    share_weight: { type: 'boolean', default: null },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('shares', 'share_weight');
};
