exports.up = (pgm) => {
  pgm.addColumn('message_reads', {
    shares_seen_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('message_reads', 'shares_seen_at');
};
