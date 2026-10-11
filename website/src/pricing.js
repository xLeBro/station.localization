const config = require('./config');

function quote({ service, words, express }) {
  const s = config.services[service];
  if (!s) throw new Error(`Unknown service: ${service}`);
  const count = Math.max(0, Math.floor(Number(words) || 0));

  const baseCents = Math.max(Math.round(count * s.perWord * 100), s.minimum * 100);
  const expressCents = express ? Math.round(baseCents * s.expressSurcharge) : 0;

  let days = Math.max(s.minDays, Math.ceil(count / s.wordsPerDay));
  if (express) days = Math.max(1, Math.ceil(days * s.expressDayFactor));

  return {
    service,
    words: count,
    express: Boolean(express),
    baseCents,
    expressCents,
    totalCents: baseCents + expressCents,
    days,
    revisions: s.revisions,
  };
}

module.exports = { quote };
