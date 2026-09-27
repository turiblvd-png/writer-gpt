/** Word lists backing the readability and title assessments. */

export const TRANSITION_WORDS = new Set([
  'accordingly','additionally','afterward','also','although','arguably','as','besides','briefly',
  'but','certainly','clearly','consequently','conversely','correspondingly','crucially','despite',
  'earlier','equally','especially','eventually','evidently','finally','first','firstly','following',
  'for example','for instance','fortunately','further','furthermore','generally','hence','however',
  'importantly','in addition','in contrast','in fact','in other words','in particular','in short',
  'in summary','indeed','initially','instead','interestingly','lastly','later','likewise','meanwhile',
  'moreover','namely','naturally','nevertheless','next','nonetheless','notably','obviously','of course',
  'on the contrary','on the other hand','otherwise','overall','particularly','previously','rather',
  'regardless','second','secondly','significantly','similarly','simultaneously','since','so','specifically',
  'still','subsequently','such as','surprisingly','that is','then','thereafter','therefore','third',
  'thirdly','though','thus','to summarise','to summarize','typically','ultimately','unfortunately',
  'unlike','usually','whereas','while','yet',
]);

/** Multi-word transitions must be matched before single tokens. */
export const TRANSITION_PHRASES = [...TRANSITION_WORDS].filter((w) => w.includes(' '));

export const POWER_WORDS = new Set([
  'amazing','authentic','best','bold','brilliant','complete','crucial','definitive','effortless',
  'essential','exclusive','expert','extraordinary','fast','free','guaranteed','hidden','honest',
  'incredible','instant','irresistible','key','launch','legendary','limited','master','new','only',
  'perfect','powerful','practical','premium','proven','quick','rare','remarkable','revealed','secret',
  'simple','smart','stunning','surprising','tested','top','ultimate','uncovered','unmissable','urgent',
  'vital','winning','worst',
]);

/** Irregular past participles that the -ed heuristic would miss. */
export const IRREGULAR_PARTICIPLES = new Set([
  'awarded','been','begun','broken','brought','built','bought','caught','chosen','come','cut','done',
  'drawn','driven','eaten','fallen','felt','fought','found','given','gone','grown','heard','held','hit',
  'kept','known','laid','led','left','lost','made','meant','met','paid','put','read','run','said','seen',
  'sent','set','shown','shut','sold','sought','spent','spoken','stood','taken','taught','thought','told',
  'understood','won','worn','written',
]);

export const BE_FORMS = new Set(['is','are','was','were','be','been','being','am','get','gets','got','gotten']);
