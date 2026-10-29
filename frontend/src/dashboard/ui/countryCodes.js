/**
 * Country calling codes, for phone numbers of clients anywhere in the world. A phone number is saved as
 * "<code> <number>", for example "+91 98765 43210" or "+1 415 555 0134".
 */
const LIST = [
  ['Afghanistan', '+93'], ['Albania', '+355'], ['Algeria', '+213'], ['Andorra', '+376'], ['Angola', '+244'],
  ['Argentina', '+54'], ['Armenia', '+374'], ['Australia', '+61'], ['Austria', '+43'], ['Azerbaijan', '+994'],
  ['Bahamas', '+1'], ['Bahrain', '+973'], ['Bangladesh', '+880'], ['Barbados', '+1'], ['Belarus', '+375'],
  ['Belgium', '+32'], ['Belize', '+501'], ['Benin', '+229'], ['Bhutan', '+975'], ['Bolivia', '+591'],
  ['Bosnia and Herzegovina', '+387'], ['Botswana', '+267'], ['Brazil', '+55'], ['Brunei', '+673'], ['Bulgaria', '+359'],
  ['Burkina Faso', '+226'], ['Burundi', '+257'], ['Cambodia', '+855'], ['Cameroon', '+237'], ['Canada', '+1'],
  ['Cape Verde', '+238'], ['Central African Republic', '+236'], ['Chad', '+235'], ['Chile', '+56'], ['China', '+86'],
  ['Colombia', '+57'], ['Comoros', '+269'], ['Congo', '+242'], ['Congo (DR)', '+243'], ['Costa Rica', '+506'],
  ['Croatia', '+385'], ['Cuba', '+53'], ['Cyprus', '+357'], ['Czechia', '+420'], ['Denmark', '+45'],
  ['Djibouti', '+253'], ['Dominican Republic', '+1'], ['Ecuador', '+593'], ['Egypt', '+20'], ['El Salvador', '+503'],
  ['Equatorial Guinea', '+240'], ['Eritrea', '+291'], ['Estonia', '+372'], ['Eswatini', '+268'], ['Ethiopia', '+251'],
  ['Fiji', '+679'], ['Finland', '+358'], ['France', '+33'], ['Gabon', '+241'], ['Gambia', '+220'],
  ['Georgia', '+995'], ['Germany', '+49'], ['Ghana', '+233'], ['Greece', '+30'], ['Guatemala', '+502'],
  ['Guinea', '+224'], ['Guyana', '+592'], ['Haiti', '+509'], ['Honduras', '+504'], ['Hong Kong', '+852'],
  ['Hungary', '+36'], ['Iceland', '+354'], ['India', '+91'], ['Indonesia', '+62'], ['Iran', '+98'],
  ['Iraq', '+964'], ['Ireland', '+353'], ['Israel', '+972'], ['Italy', '+39'], ['Ivory Coast', '+225'],
  ['Jamaica', '+1'], ['Japan', '+81'], ['Jordan', '+962'], ['Kazakhstan', '+7'], ['Kenya', '+254'],
  ['Kuwait', '+965'], ['Kyrgyzstan', '+996'], ['Laos', '+856'], ['Latvia', '+371'], ['Lebanon', '+961'],
  ['Lesotho', '+266'], ['Liberia', '+231'], ['Libya', '+218'], ['Liechtenstein', '+423'], ['Lithuania', '+370'],
  ['Luxembourg', '+352'], ['Macau', '+853'], ['Madagascar', '+261'], ['Malawi', '+265'], ['Malaysia', '+60'],
  ['Maldives', '+960'], ['Mali', '+223'], ['Malta', '+356'], ['Mauritania', '+222'], ['Mauritius', '+230'],
  ['Mexico', '+52'], ['Moldova', '+373'], ['Monaco', '+377'], ['Mongolia', '+976'], ['Montenegro', '+382'],
  ['Morocco', '+212'], ['Mozambique', '+258'], ['Myanmar', '+95'], ['Namibia', '+264'], ['Nepal', '+977'],
  ['Netherlands', '+31'], ['New Zealand', '+64'], ['Nicaragua', '+505'], ['Niger', '+227'], ['Nigeria', '+234'],
  ['North Macedonia', '+389'], ['Norway', '+47'], ['Oman', '+968'], ['Pakistan', '+92'], ['Palestine', '+970'],
  ['Panama', '+507'], ['Papua New Guinea', '+675'], ['Paraguay', '+595'], ['Peru', '+51'], ['Philippines', '+63'],
  ['Poland', '+48'], ['Portugal', '+351'], ['Puerto Rico', '+1'], ['Qatar', '+974'], ['Romania', '+40'],
  ['Russia', '+7'], ['Rwanda', '+250'], ['Saudi Arabia', '+966'], ['Senegal', '+221'], ['Serbia', '+381'],
  ['Seychelles', '+248'], ['Sierra Leone', '+232'], ['Singapore', '+65'], ['Slovakia', '+421'], ['Slovenia', '+386'],
  ['Somalia', '+252'], ['South Africa', '+27'], ['South Korea', '+82'], ['South Sudan', '+211'], ['Spain', '+34'],
  ['Sri Lanka', '+94'], ['Sudan', '+249'], ['Suriname', '+597'], ['Sweden', '+46'], ['Switzerland', '+41'],
  ['Syria', '+963'], ['Taiwan', '+886'], ['Tajikistan', '+992'], ['Tanzania', '+255'], ['Thailand', '+66'],
  ['Togo', '+228'], ['Trinidad and Tobago', '+1'], ['Tunisia', '+216'], ['Turkey', '+90'], ['Turkmenistan', '+993'],
  ['Uganda', '+256'], ['Ukraine', '+380'], ['United Arab Emirates', '+971'], ['United Kingdom', '+44'], ['United States', '+1'],
  ['Uruguay', '+598'], ['Uzbekistan', '+998'], ['Venezuela', '+58'], ['Vietnam', '+84'], ['Yemen', '+967'],
  ['Zambia', '+260'], ['Zimbabwe', '+263'],
];

export const COUNTRIES = LIST.map(([name, dial]) => ({ name, dial, key: `${name}|${dial}` }));

/** The default: India. */
export const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.name === 'India');

/** The options for a country select ("India (+91)"). The value is the country's key. */
export const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.key, label: `${c.name} (${c.dial})` }));

export const countryByKey = (key) => COUNTRIES.find((c) => c.key === key) || DEFAULT_COUNTRY;

/**
 * Split a saved phone number into its country and the rest: "+44 20 7946 0958" -> United Kingdom, "20 7946 0958".
 * The longest matching code wins (+1 868 before +1). A number without a "+" code stays whole, with India chosen.
 * `preferred` (a country key) is used when several countries share the code (the US and Canada share +1).
 */
export function splitPhone(phone, preferred = null) {
  const text = String(phone || '').trim();
  if (!text.startsWith('+')) return { country: DEFAULT_COUNTRY, number: text };
  const digits = text.replace(/[^\d+]/g, '');
  const matches = COUNTRIES.filter((c) => digits.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length);
  if (!matches.length) return { country: DEFAULT_COUNTRY, number: text };
  const best = matches.filter((c) => c.dial === matches[0].dial);
  const country = best.find((c) => c.key === preferred) || best.find((c) => c.name === 'India') || best.find((c) => c.name === 'United States') || best[0];
  // drop the code (and the space after it) from what was typed
  let rest = text.slice(1);
  let need = country.dial.length - 1;
  let i = 0;
  while (need > 0 && i < rest.length) {
    if (/\d/.test(rest[i])) need -= 1;
    i += 1;
  }
  rest = rest.slice(i).replace(/^[\s-]+/, '');
  return { country, number: rest };
}

/** The phone number as saved: "+91 98765 43210". */
export const joinPhone = (country, number) => `${country.dial} ${String(number || '').trim()}`;