// Grade 2 Braille Contractions
// Based on Unified English Braille (UEB) Grade 2

const GRADE2_CONTRACTIONS = {
    // Single-cell whole-word contractions
    but: '⠃',
    can: '⠉',
    do: '⠙',
    every: '⠑',
    from: '⠋',
    go: '⠛',
    have: '⠓',
    just: '⠚',
    knowledge: '⠅',
    like: '⠇',
    more: '⠍',
    not: '⠝',
    people: '⠏',
    quite: '⠟',
    rather: '⠗',
    so: '⠎',
    that: '⠞',
    us: '⠥',
    very: '⠧',
    will: '⠺',
    it: '⠭',
    you: '⠽',
    as: '⠵',
    and: '⠯',
    for: '⠿',
    of: '⠷',
    the: '⠮',
    with: '⠾',

    // Common letter groups (contracted within words)
    st: '⠌',
    ar: '⠜',
    ing: '⠬',
    ed: '⠫',
    er: '⠻',
    ou: '⠳',
    ow: '⠪',
    ch: '⠡',
    gh: '⠣',
    sh: '⠩',
    th: '⠹',
    wh: '⠱',
    en: '⠢',
    in: '⠔',

    // Common words
    about: '⠁⠃',
    above: '⠁⠃⠧',
    according: '⠁⠉',
    across: '⠁⠉⠗',
    after: '⠁⠋',
    afternoon: '⠁⠋⠝',
    afterward: '⠁⠋⠺',
    again: '⠁⠛',
    against: '⠁⠛⠌',
    almost: '⠁⠇⠍',
    already: '⠁⠇⠗',
    also: '⠁⠇',
    although: '⠁⠇⠹',
    altogether: '⠁⠇⠞',
    always: '⠁⠇⠺',
    because: '⠃⠉',
    before: '⠃⠋',
    behind: '⠃⠓',
    below: '⠃⠇',
    beneath: '⠃⠢',
    beside: '⠃⠎',
    between: '⠃⠞',
    beyond: '⠃⠽',
    blind: '⠃⠇',
    braille: '⠃⠗⠇',
    children: '⠡⠝',
    could: '⠉⠙',
    either: '⠑⠊',
    first: '⠋⠌',
    friend: '⠋⠗',
    good: '⠛⠙',
    great: '⠛⠗⠞',
    herself: '⠓⠻⠋',
    himself: '⠓⠍⠋',
    immediate: '⠊⠍⠍',
    little: '⠇⠇',
    letter: '⠇⠗',
    much: '⠍⠡',
    must: '⠍⠌',
    myself: '⠍⠽⠋',
    necessary: '⠝⠑⠉',
    neither: '⠝⠑⠊',
    perhaps: '⠏⠻⠓',
    quick: '⠟⠅',
    receive: '⠗⠉⠧',
    receiving: '⠗⠉⠧⠛',
    rejoice: '⠗⠚⠉',
    rejoicing: '⠗⠚⠉⠛',
    said: '⠎⠙',
    should: '⠩⠙',
    such: '⠎⠡',
    today: '⠞⠙',
    together: '⠞⠛⠗',
    tomorrow: '⠞⠍',
    tonight: '⠞⠝',
    would: '⠺⠙',
    your: '⠽⠗',
    yourself: '⠽⠗⠋',
    yourselves: '⠽⠗⠧⠎',

    // Special contractions for common endings
    ance: '⠨⠑',
    ence: '⠰⠑',
    ful: '⠰⠇',
    ity: '⠰⠽',
    less: '⠨⠎',
    ment: '⠰⠞',
    ness: '⠰⠎',
    ong: '⠰⠛',
    tion: '⠰⠝',
    ount: '⠨⠞',
    sion: '⠨⠝'
};

// Simple letter mapping for uncontracted characters
const LETTER_MAP = {
    A: '⠁',
    B: '⠃',
    C: '⠉',
    D: '⠙',
    E: '⠑',
    F: '⠋',
    G: '⠛',
    H: '⠓',
    I: '⠊',
    J: '⠚',
    K: '⠅',
    L: '⠇',
    M: '⠍',
    N: '⠝',
    O: '⠕',
    P: '⠏',
    Q: '⠟',
    R: '⠗',
    S: '⠎',
    T: '⠞',
    U: '⠥',
    V: '⠧',
    W: '⠺',
    X: '⠭',
    Y: '⠽',
    Z: '⠵',
    1: '⠼⠁',
    2: '⠼⠃',
    3: '⠼⠉',
    4: '⠼⠙',
    5: '⠼⠑',
    6: '⠼⠋',
    7: '⠼⠛',
    8: '⠼⠓',
    9: '⠼⠊',
    0: '⠼⠚',
    ' ': ' ',
    '.': '⠲',
    ',': '⠂',
    '!': '⠖',
    '?': '⠦',
    ':': '⠒',
    ';': '⠆',
    '-': '⠤',
    "'": '⠄'
};

function translateToGrade2(text) {
    if (!text) return '';

    let result = '';
    const words = text.split(/(\s+)/); // Split but keep spaces

    for (let word of words) {
        if (/^\s+$/.test(word)) {
            // It's whitespace, keep it
            result += word;
            continue;
        }

        // Convert to lowercase for matching
        const lowerWord = word.toLowerCase();

        // Check for whole-word contractions first
        if (GRADE2_CONTRACTIONS[lowerWord]) {
            result += GRADE2_CONTRACTIONS[lowerWord];
            continue;
        }

        // Process word for partial contractions
        let processedWord = lowerWord;
        let wasContracted = false;

        // Look for multi-letter contractions within the word
        for (let [group, contraction] of Object.entries(GRADE2_CONTRACTIONS)) {
            if (group.length > 1 && processedWord.includes(group)) {
                processedWord = processedWord.replace(new RegExp(group, 'g'), contraction);
                wasContracted = true;
            }
        }

        // If contractions were applied, use the contracted form
        if (wasContracted) {
            result += processedWord;
        } else {
            // Otherwise, convert letter by letter
            for (let char of word.toUpperCase()) {
                result += LETTER_MAP[char] || char;
            }
        }
    }

    return result;
}

// Export for use in HTML
if (typeof window !== 'undefined') {
    window.translateToGrade2Braille = translateToGrade2;
}
