// Lightweight profanity filter — no dependencies
// Covers common English profanity, slurs, and leet-speak evasion

const PROFANITY_LIST = [
  'ass', 'asshole', 'bastard', 'bitch', 'blowjob', 'bollocks',
  'cock', 'crap', 'cunt', 'damn', 'dick', 'dildo', 'douche',
  'fag', 'faggot', 'fuck', 'fucker', 'fucking', 'goddam',
  'goddamn', 'handjob', 'hell', 'homo', 'horny', 'jerk',
  'kike', 'lesbian', 'milf', 'motherfucker', 'negro', 'nigga',
  'nigger', 'penis', 'piss', 'porn', 'prick', 'pussy',
  'queer', 'rape', 'retard', 'retarded', 'sex', 'sexy',
  'shit', 'shitty', 'slut', 'stfu', 'tits', 'twat',
  'vagina', 'wank', 'whore', 'wtf',
];

// Leet-speak character substitutions
const CHAR_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
  '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i',
};

function normalize(text) {
  let n = text.toLowerCase();
  for (const [char, repl] of Object.entries(CHAR_MAP)) {
    n = n.split(char).join(repl);
  }
  // Remove separator evasion (f.u.c.k, s-h-i-t, s_h_i_t)
  n = n.replace(/[.\-_]/g, '');
  return n;
}

// Pre-compile regex with word boundaries (for messages/chat)
const profanityRegex = new RegExp(
  '\\b(' + PROFANITY_LIST.join('|') + ')\\b', 'i'
);

/**
 * Check chat messages / comments for profanity (word-boundary matching)
 */
function containsProfanity(text) {
  return profanityRegex.test(normalize(text));
}

/**
 * Check usernames for profanity (substring match — stricter, no word boundaries)
 */
function usernameContainsProfanity(username) {
  const n = normalize(username);
  return PROFANITY_LIST.some(word => n.includes(word));
}

module.exports = { containsProfanity, usernameContainsProfanity };
