import type { PathId } from './model'

export interface Phrase {
  id: string
  text: string
  reading: string
  meaning: string
  situation: string
  note: string
}
export interface Lesson {
  id: string
  title: string
  invitation: string
  phrases: Phrase[]
}
export interface Path {
  id: PathId
  title: string
  subtitle: string
  symbol: string
  colour: string
  language?: string
  lessons: Lesson[]
  source: string
  sourceName: string
}
type Words = [string, string, string, string, string]
function language(
  id: PathId,
  title: string,
  subtitle: string,
  symbol: string,
  colour: string,
  lang: string,
  source: string,
  sourceName: string,
  chapters: [string, string, Words[]][],
): Path {
  return {
    id,
    title,
    subtitle,
    symbol,
    colour,
    language: lang,
    source,
    sourceName,
    lessons: chapters.map(([title, invitation, words], i) => ({
      id: `${id}-${i + 1}`,
      title,
      invitation,
      phrases: words.map(([text, reading, meaning, situation, note], j) => ({
        id: `${id}-${i + 1}-${j + 1}`,
        text,
        reading,
        meaning,
        situation,
        note,
      })),
    })),
  }
}
export const PATHS: Path[] = [
  language(
    'spanish',
    'Spanish',
    'A few words can open a door.',
    'hola',
    '#e9c28d',
    'es-ES',
    'https://trayectos.coerll.utexas.edu/v1/mod0/introduccion-comunicativa/',
    'University of Texas · Trayectos',
    [
      [
        'A first hello',
        'Meet someone without reaching for English.',
        [
          [
            'Hola',
            '',
            'Hello',
            'You arrive and want to greet someone.',
            'The h is silent. This greeting works at any time of day.',
          ],
          [
            'Gracias',
            '',
            'Thank you',
            'Someone has done something kind for you.',
            'A small word you can use immediately, even in an otherwise English conversation.',
          ],
          [
            'Hasta luego',
            '',
            'See you later',
            'You are leaving, but expect to see the person again.',
            'Hasta points toward a later moment; luego means later.',
          ],
        ],
      ],
      [
        'Getting acquainted',
        'Give someone your name, then make room for theirs.',
        [
          [
            'Me llamo…',
            '',
            'My name is…',
            'You introduce yourself, adding your name at the end.',
            'Say the whole phrase with your own name. Llamo belongs with me, not mi.',
          ],
          [
            '¿Cómo te llamas?',
            '',
            'What is your name?',
            'You ask someone your own age what to call them.',
            'This is the informal singular form. Use ¿Cómo se llama? in a formal situation.',
          ],
          [
            'Mucho gusto',
            '',
            'Nice to meet you',
            'Someone has just introduced themselves.',
            'A friendly, compact response when meeting someone for the first time.',
          ],
        ],
      ],
      [
        'Room to learn',
        'Ask for help keeping the conversation going.',
        [
          [
            'No entiendo',
            '',
            'I do not understand',
            'You heard the words but did not understand them.',
            'No comes before the verb. You can use this without apologising for learning.',
          ],
          [
            'Más despacio, por favor',
            '',
            'More slowly, please',
            'The other person is speaking too quickly.',
            'The accent in más matters. Despacio means slowly.',
          ],
          [
            '¿Puedes repetir?',
            '',
            'Can you repeat?',
            'You would like an informal conversation partner to say it again.',
            'Puedes addresses one person informally. ¿Puede repetir? is the formal version.',
          ],
        ],
      ],
      [
        'At a small café',
        'Order something simple and say what you need.',
        [
          [
            'Un café, por favor',
            '',
            'A coffee, please',
            'You are ordering one coffee.',
            'Un is one or a. Café has its stress on the final syllable.',
          ],
          [
            'Quiero agua',
            '',
            'I want water',
            'You say what you would like to drink.',
            'Quiero means I want. Add por favor to make the request more courteous.',
          ],
          [
            'La cuenta, por favor',
            '',
            'The bill, please',
            'You have finished and want to pay.',
            'La cuenta is the bill in this café context.',
          ],
        ],
      ],
      [
        'Finding your way',
        'Three useful questions when you are somewhere new.',
        [
          [
            '¿Dónde está el baño?',
            '',
            'Where is the bathroom?',
            'You need to find the bathroom.',
            'Dónde asks where. Está asks where this one place is located.',
          ],
          [
            '¿Cuánto cuesta?',
            '',
            'How much does it cost?',
            'You point to something and ask its price.',
            'Cuánto asks about an amount. The question works without naming the item.',
          ],
          [
            'Estoy aquí',
            '',
            'I am here',
            'You tell someone where you are on a map.',
            'Estoy is used for your location. Aquí means here.',
          ],
        ],
      ],
      [
        'A little about your day',
        'Move from useful requests to a small conversation.',
        [
          [
            'Estoy bien',
            '',
            'I am well',
            'Someone asks how you are and you are doing well.',
            'This describes how you feel now.',
          ],
          [
            'Me gusta la música',
            '',
            'I like music',
            'You tell someone about something you enjoy.',
            'Spanish expresses this as music being pleasing to me. Keep me gusta together.',
          ],
          [
            'Hasta mañana',
            '',
            'See you tomorrow',
            'You will see the other person the next day.',
            'Mañana means tomorrow here. The ñ has its own sound, like ny.',
          ],
        ],
      ],
    ],
  ),
  language(
    'mandarin',
    'Mandarin',
    'Hear the shape of a new conversation.',
    '你好',
    '#b9cbd3',
    'zh-CN',
    'https://ocw.mit.edu/courses/res-21g-003-learning-chinese-a-foundation-course-in-mandarin-spring-2011/pages/online-textbook/',
    'MIT OpenCourseWare · Mandarin text and audio',
    [
      [
        'A first hello',
        'Start with three phrases you can use today.',
        [
          [
            '你好',
            'nǐ hǎo',
            'Hello',
            'You greet someone you have just met.',
            'Pinyin marks tones: both written third tones here. In connected speech, the first changes to a rising tone.',
          ],
          [
            '谢谢',
            'xièxie',
            'Thank you',
            'Someone helps you and you want to thank them.',
            'The second syllable is normally light and unstressed.',
          ],
          [
            '再见',
            'zàijiàn',
            'Goodbye',
            'You are parting after a conversation.',
            'Both syllables have falling tones. Say them clearly rather than loudly.',
          ],
        ],
      ],
      [
        'Names and introductions',
        'Make the first exchange a little more personal.',
        [
          [
            '我叫…',
            'wǒ jiào…',
            'My name is…',
            'You give your name, adding it at the end.',
            '我 is I. 叫 introduces the name you are called.',
          ],
          [
            '你叫什么名字？',
            'nǐ jiào shénme míngzi',
            'What is your name?',
            'You ask what someone is called.',
            '什么 asks what. You do not need to add 吗 to this question.',
          ],
          [
            '很高兴认识你',
            'hěn gāoxìng rènshi nǐ',
            'Nice to meet you',
            'You respond after meeting someone for the first time.',
            'A complete, polite introduction phrase. Everyday introductions can also be shorter.',
          ],
        ],
      ],
      [
        'Help me understand',
        'Keep talking even when you cannot follow everything.',
        [
          [
            '我不明白',
            'wǒ bù míngbai',
            'I do not understand',
            'You need to say that the meaning is unclear.',
            '不 negates the verb here. The final syllable of 明白 is light.',
          ],
          [
            '请再说一遍',
            'qǐng zài shuō yí biàn',
            'Please say it again',
            'You would like to hear the phrase once more.',
            '请 makes a polite request. 一 is pronounced yí before the falling tone in 遍.',
          ],
          [
            '慢一点',
            'màn yìdiǎn',
            'A little more slowly',
            'You ask someone to slow down.',
            '一点 softens the request: a little. Add 请 when asking politely.',
          ],
        ],
      ],
      [
        'Something to drink',
        'Make a small request at a café.',
        [
          [
            '我要茶',
            'wǒ yào chá',
            'I want tea',
            'You tell someone your drink choice.',
            '茶 has a rising tone. 要 means want in this sentence.',
          ],
          [
            '请给我一杯水',
            'qǐng gěi wǒ yì bēi shuǐ',
            'Please give me a glass of water',
            'You politely ask for a glass of water.',
            '杯 counts cups or glasses. The tone of 一 changes before 杯.',
          ],
          [
            '多少钱？',
            'duōshao qián',
            'How much money?',
            'You ask the price of something.',
            'An everyday way to ask how much something costs. 少 is light in this phrase.',
          ],
        ],
      ],
      [
        'Out and about',
        'Find a place and ask for a direction.',
        [
          [
            '厕所在哪里？',
            'cèsuǒ zài nǎlǐ',
            'Where is the toilet?',
            'You ask someone to point you toward a toilet.',
            '哪里 asks where; it stays in the place where the answer would go.',
          ],
          [
            '我迷路了',
            'wǒ mílù le',
            'I am lost',
            'You need help because you have lost your way.',
            '了 signals the changed situation here.',
          ],
          [
            '怎么走？',
            'zěnme zǒu',
            'How do I get there?',
            'After naming a destination, you ask for directions.',
            '怎么 asks how. 走 means walk or go in this phrase.',
          ],
        ],
      ],
      [
        'A little conversation',
        'Say how you are and name something you enjoy.',
        [
          [
            '我很好',
            'wǒ hěn hǎo',
            'I am well',
            'You answer a question about how you are.',
            '很 commonly connects a subject with an adjective; it need not emphasise very.',
          ],
          [
            '我喜欢音乐',
            'wǒ xǐhuan yīnyuè',
            'I like music',
            'You tell someone that you enjoy music.',
            '乐 is pronounced yuè in 音乐.',
          ],
          [
            '明天见',
            'míngtiān jiàn',
            'See you tomorrow',
            'You arrange to see the person the next day.',
            '明天 is tomorrow. 见 is see or meet.',
          ],
        ],
      ],
    ],
  ),
  language(
    'hausa',
    'Hausa',
    'Familiar places, a new way to greet them.',
    'sannu',
    '#c3cd9b',
    'ha-NG',
    'https://wisc.pb.unizin.org/lctlresources/chapter/hausa-greetings/',
    'University of Wisconsin · Hausa resources',
    [
      [
        'A warm greeting',
        'Begin with a greeting, thanks, and a goodbye.',
        [
          [
            'Sannu',
            '',
            'Hello',
            'You give someone a simple greeting.',
            'Sannu has several uses, including greeting and expressing care. Context matters.',
          ],
          [
            'Na gode',
            '',
            'Thank you',
            'Someone helps you and you want to thank them.',
            'A useful expression to practise as one phrase.',
          ],
          [
            'Sai anjima',
            '',
            'See you later',
            'You say goodbye for now.',
            'A friendly farewell when you expect to meet again.',
          ],
        ],
      ],
      [
        'Morning and evening',
        'Let the time of day become part of your greeting.',
        [
          [
            'Ina kwana?',
            '',
            'Good morning',
            'You greet someone in the morning.',
            'Literally asks about the night. Greetings often invite an exchange, not just one word.',
          ],
          [
            'Ina wuni?',
            '',
            'Good afternoon',
            'You greet someone later in the day.',
            'Asks about the day; also used toward evening.',
          ],
          [
            'Lafiya lau',
            '',
            'Very well',
            'Someone asks how you are and you are well.',
            'A common reply during a greeting exchange.',
          ],
        ],
      ],
      [
        'Useful little words',
        'Three small words to make a request or respond.',
        [
          [
            'Don Allah',
            '',
            'Please',
            'You soften a request for help.',
            'Literally for God’s sake; commonly used as please.',
          ],
          [
            'Eh',
            '',
            'Yes',
            'You answer a simple question affirmatively.',
            'Listen to native speakers for the vowel and intonation.',
          ],
          [
            'A’a',
            '',
            'No',
            'You give a negative answer.',
            'The apostrophe represents a break between the vowels, not an English long a.',
          ],
        ],
      ],
      [
        'One, two, three',
        'Use a few numbers with things around you.',
        [
          [
            'Ɗaya',
            '',
            'One',
            'You count the first object.',
            'Ɗ is a distinct Hausa consonant, not simply an English d.',
          ],
          [
            'Biyu',
            '',
            'Two',
            'You count two objects.',
            'Try pointing to two things while saying the word.',
          ],
          [
            'Uku',
            '',
            'Three',
            'You count three objects.',
            'Hausa is tonal; these starter spellings do not mark tone or vowel length. Use the linked native-learning resources alongside them.',
          ],
        ],
      ],
    ],
  ),
  {
    id: 'drawing',
    title: 'Drawing',
    subtitle: 'Learn to see, one mark at a time.',
    symbol: '〰',
    colour: '#d1bbd6',
    source: 'https://drawabox.com/lesson/1',
    sourceName: 'Drawabox · lines, ellipses and boxes',
    lessons: [
      {
        id: 'drawing-1',
        title: 'A confident line',
        invitation:
          'Place two dots. Rehearse the movement above the page, then join them with one calm stroke. Make six pairs at different angles. Aim for a confident movement before perfect accuracy.',
        phrases: [],
      },
      {
        id: 'drawing-2',
        title: 'Round things',
        invitation:
          'Draw six ellipses: wide, narrow, and almost round. Move around each shape twice without stopping. Notice whether its two halves feel balanced.',
        phrases: [],
      },
      {
        id: 'drawing-3',
        title: 'A leaf, slowly',
        invitation:
          'Draw one curved centre line. Build the two edges of a leaf around it, then add a few veins. Make a second leaf from a different angle. Look at a real leaf if one is nearby.',
        phrases: [],
      },
      {
        id: 'drawing-4',
        title: 'A cup with volume',
        invitation:
          'Start with an ellipse for the rim. Bring two sides down and join them with a shallow curve. Add a handle. Keep the bottom curve related to the rim, then try another cup.',
        phrases: [],
      },
      {
        id: 'drawing-5',
        title: 'Light and shade',
        invitation:
          'Draw a ball and mark a light source above it. Keep the side nearest the light pale; layer curved strokes on the opposite side. Give it a shadow on the ground.',
        phrases: [],
      },
      {
        id: 'drawing-6',
        title: 'Your companion',
        invitation:
          'Use a large oval for a body and a smaller circle for a head. Add a muzzle, two ears, paws and a tail. Make one drawing from simple shapes, then a second with more personality.',
        phrases: [],
      },
    ],
  },
  {
    id: 'rhythm',
    title: 'Rhythm',
    subtitle: 'Find the beat before the instrument.',
    symbol: '♩',
    colour: '#a9ccbf',
    source: 'https://www.musictheory.net/lessons/11',
    sourceName: 'musictheory.net · note duration',
    lessons: [
      {
        id: 'rhythm-1',
        title: 'A steady pulse',
        invitation:
          'Listen to four count-in beats. Then tap on each pulse for two bars. Keep your hand moving evenly between taps.',
        phrases: [],
      },
      {
        id: 'rhythm-2',
        title: 'Leave some room',
        invitation:
          'Tap on beats one and three in each bar. Keep counting through the quiet beats: the pulse continues even when you do not play.',
        phrases: [],
      },
      {
        id: 'rhythm-3',
        title: 'Between the beats',
        invitation:
          'Count “one and two and three and four and”. Tap on each number and each “and”: two even taps per beat.',
        phrases: [],
      },
      {
        id: 'rhythm-4',
        title: 'A little syncopation',
        invitation:
          'Follow the glowing marks. Some taps fall between the main beats. Keep counting steadily while the rhythm moves around the pulse.',
        phrases: [],
      },
    ],
  },
]
export const allPhrases = PATHS.flatMap((path) => path.lessons.flatMap((lesson) => lesson.phrases))
export const findLesson = (id: string) =>
  PATHS.flatMap((p) => p.lessons).find((lesson) => lesson.id === id)
export const BEATS: Record<string, number[]> = {
  'rhythm-1': [0, 1, 2, 3, 4, 5, 6, 7],
  'rhythm-2': [0, 2, 4, 6],
  'rhythm-3': Array.from({ length: 16 }, (_, i) => i / 2),
  'rhythm-4': [0, 1.5, 2, 3.5, 4, 5.5, 6, 7.5],
}
