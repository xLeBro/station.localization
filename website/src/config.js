// Business settings for the site. Everything a client sees about prices,
// languages and published work comes from this file, so edit it here.

module.exports = {
  profile: {
    name: 'Leandro Brouschert',
    location: 'Luxembourg',
    contactEmail: process.env.CONTACT_EMAIL || 'hello@example.com',
    fiverrUrl: 'https://www.fiverr.com/leandro077',
    amazonUrl: 'https://www.amazon.com/s?k=Leandro+Brouschert',
    // Shown on the home page. Check these against your Fiverr profile and keep them current.
    fiverrRating: 4.8,
    fiverrReviews: 668,
  },

  currency: 'usd',

  languages: {
    en: 'English',
    de: 'German',
    fr: 'French',
  },

  // [source, target]
  pairs: [
    ['en', 'de'],
    ['de', 'en'],
    ['en', 'fr'],
    ['de', 'fr'],
    ['fr', 'de'],
    ['fr', 'en'],
  ],

  // perWord and minimum are in the main currency unit (dollars).
  // Days are calculated as max(minDays, ceil(words / wordsPerDay)); express
  // multiplies the price by (1 + expressSurcharge) and the days by expressDayFactor.
  services: {
    document: {
      perWord: 0.03, // Fiverr: $45 for 1,500 words
      minimum: 15,
      wordsPerDay: 1500,
      minDays: 2,
      revisions: 2,
      expressSurcharge: 0.5,
      expressDayFactor: 0.5,
    },
    book: {
      perWord: 0.013, // Fiverr: $650 for 50,000 words in 10 days
      minimum: 150,
      wordsPerDay: 5000,
      minDays: 3,
      revisions: 3,
      expressSurcharge: 0.185, // Fiverr: +$120 on $650 for 7 instead of 10 days
      expressDayFactor: 0.7,
    },
    proofreading: {
      perWord: 0.015,
      minimum: 15,
      wordsPerDay: 4000,
      minDays: 1,
      revisions: 1,
      expressSurcharge: 0.5,
      expressDayFactor: 0.5,
    },
  },

  // Published translations, listed on Amazon with Leandro Brouschert as translator.
  books: [
    { title: 'Das Schild des Herkules', series: 'Ein Sam Reilly Thriller 36', author: 'Christopher Cartwright', pair: 'en-de', url: 'https://www.amazon.com/dp/B0FPL37PK7' },
    { title: 'Ikarus auf Abwegen', series: 'Ein Sam Reilly Thriller 35', author: 'Christopher Cartwright', pair: 'en-de', url: 'https://www.amazon.com/dp/B0FH69NW6M' },
    { title: 'Caliburns Kampf', series: 'Ein Sam Reilly Thriller 34', author: 'Christopher Cartwright', pair: 'en-de', url: 'https://www.amazon.com/dp/B0FGY8XGDH' },
    { title: 'Der Abyss-Kodex', series: 'Ein Sam Reilly Thriller 33', author: 'Christopher Cartwright', pair: 'en-de', url: 'https://www.amazon.com/dp/B0F7WTX4B1' },
    { title: 'Nekropole der Götter', series: 'Ein Sam Reilly Thriller 32', author: 'Christopher Cartwright', pair: 'en-de', url: 'https://www.amazon.de/dp/B0F89248H5' },
    { title: 'Verbrannte Erde', series: 'Ein Pax West Thriller', author: 'Christopher Cartwright', pair: 'en-de', url: 'https://www.amazon.com/dp/B0DHLKCZQV' },
    { title: 'Sauve Moi', series: 'Attraction Animale t. 4', author: 'Kameron Claire', pair: 'en-fr', url: 'https://www.amazon.com/dp/B0D4JJ7PHK' },
    { title: 'Rassemblement', series: 'Le Dernier Saloon t. 1', author: 'Kameron Claire', pair: 'en-fr', url: 'https://www.amazon.com/dp/B0DZ99LX5N' },
  ],

  uploads: {
    maxFileSizeMb: 50,
    maxFiles: 10,
    // Word counts are automatic for these; other accepted types need a client estimate.
    countable: ['.docx', '.pdf', '.txt', '.md', '.srt', '.html', '.htm', '.csv'],
    accepted: ['.docx', '.pdf', '.txt', '.md', '.srt', '.html', '.htm', '.csv', '.doc', '.odt', '.rtf', '.pptx', '.xlsx', '.epub'],
  },

  // Unpaid quotes and their files are removed after this many days.
  draftRetentionDays: 7,
};
