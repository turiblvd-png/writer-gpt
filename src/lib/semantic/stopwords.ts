/** English stop words, excluded from n-gram edges and keyword salience. */
export const STOP_WORDS = new Set([
  'a','about','above','after','again','against','all','also','am','an','and','any','are','as','at',
  'be','because','been','before','being','below','between','both','but','by','can','cannot','could',
  'did','do','does','doing','down','during','each','few','for','from','further','had','has','have',
  'having','he','her','here','hers','herself','him','himself','his','how','i','if','in','into','is',
  'it','its','itself','just','me','more','most','my','myself','no','nor','not','now','of','off','on',
  'once','only','or','other','our','ours','ourselves','out','over','own','said','same','she','should',
  'so','some','such','than','that','the','their','theirs','them','themselves','then','there','these',
  'they','this','those','through','to','too','under','until','up','very','was','we','were','what',
  'when','where','which','while','who','whom','why','will','with','would','you','your','yours',
  'yourself','yourselves','s','t','don','now','ll','re','ve','m','d',
]);

/** Weak heads/tails that make an n-gram useless even when the phrase recurs. */
export const EDGE_STOP = new Set([...STOP_WORDS, 'one', 'two', 'three', 'new', 'get', 'make', 'use']);
