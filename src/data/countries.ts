// ISO country code + international dialling code. Names come from the browser (Intl.DisplayNames).
const DIAL: [string, string][] = [
  ['AF', '93'], ['AX', '358'], ['AL', '355'], ['DZ', '213'], ['AS', '1'], ['AD', '376'], ['AO', '244'], ['AI', '1'], ['AG', '1'], ['AR', '54'],
  ['AM', '374'], ['AW', '297'], ['AU', '61'], ['AT', '43'], ['AZ', '994'], ['BS', '1'], ['BH', '973'], ['BD', '880'], ['BB', '1'], ['BY', '375'],
  ['BE', '32'], ['BZ', '501'], ['BJ', '229'], ['BM', '1'], ['BT', '975'], ['BO', '591'], ['BQ', '599'], ['BA', '387'], ['BW', '267'], ['BR', '55'],
  ['IO', '246'], ['VG', '1'], ['BN', '673'], ['BG', '359'], ['BF', '226'], ['BI', '257'], ['KH', '855'], ['CM', '237'], ['CA', '1'], ['CV', '238'],
  ['KY', '1'], ['CF', '236'], ['TD', '235'], ['CL', '56'], ['CN', '86'], ['CX', '61'], ['CC', '61'], ['CO', '57'], ['KM', '269'], ['CG', '242'],
  ['CD', '243'], ['CK', '682'], ['CR', '506'], ['CI', '225'], ['HR', '385'], ['CU', '53'], ['CW', '599'], ['CY', '357'], ['CZ', '420'], ['DK', '45'],
  ['DJ', '253'], ['DM', '1'], ['DO', '1'], ['EC', '593'], ['EG', '20'], ['SV', '503'], ['GQ', '240'], ['ER', '291'], ['EE', '372'], ['SZ', '268'],
  ['ET', '251'], ['FK', '500'], ['FO', '298'], ['FJ', '679'], ['FI', '358'], ['FR', '33'], ['GF', '594'], ['PF', '689'], ['GA', '241'], ['GM', '220'],
  ['GE', '995'], ['DE', '49'], ['GH', '233'], ['GI', '350'], ['GR', '30'], ['GL', '299'], ['GD', '1'], ['GP', '590'], ['GU', '1'], ['GT', '502'],
  ['GG', '44'], ['GN', '224'], ['GW', '245'], ['GY', '592'], ['HT', '509'], ['HN', '504'], ['HK', '852'], ['HU', '36'], ['IS', '354'], ['IN', '91'],
  ['ID', '62'], ['IR', '98'], ['IQ', '964'], ['IE', '353'], ['IM', '44'], ['IL', '972'], ['IT', '39'], ['JM', '1'], ['JP', '81'], ['JE', '44'],
  ['JO', '962'], ['KZ', '7'], ['KE', '254'], ['KI', '686'], ['XK', '383'], ['KW', '965'], ['KG', '996'], ['LA', '856'], ['LV', '371'], ['LB', '961'],
  ['LS', '266'], ['LR', '231'], ['LY', '218'], ['LI', '423'], ['LT', '370'], ['LU', '352'], ['MO', '853'], ['MG', '261'], ['MW', '265'], ['MY', '60'],
  ['MV', '960'], ['ML', '223'], ['MT', '356'], ['MH', '692'], ['MQ', '596'], ['MR', '222'], ['MU', '230'], ['YT', '262'], ['MX', '52'], ['FM', '691'],
  ['MD', '373'], ['MC', '377'], ['MN', '976'], ['ME', '382'], ['MS', '1'], ['MA', '212'], ['MZ', '258'], ['MM', '95'], ['NA', '264'], ['NR', '674'],
  ['NP', '977'], ['NL', '31'], ['NC', '687'], ['NZ', '64'], ['NI', '505'], ['NE', '227'], ['NG', '234'], ['NU', '683'], ['NF', '672'], ['KP', '850'],
  ['MK', '389'], ['MP', '1'], ['NO', '47'], ['OM', '968'], ['PK', '92'], ['PW', '680'], ['PS', '970'], ['PA', '507'], ['PG', '675'], ['PY', '595'],
  ['PE', '51'], ['PH', '63'], ['PN', '64'], ['PL', '48'], ['PT', '351'], ['PR', '1'], ['QA', '974'], ['RE', '262'], ['RO', '40'], ['RU', '7'],
  ['RW', '250'], ['BL', '590'], ['SH', '290'], ['KN', '1'], ['LC', '1'], ['MF', '590'], ['PM', '508'], ['VC', '1'], ['WS', '685'], ['SM', '378'],
  ['ST', '239'], ['SA', '966'], ['SN', '221'], ['RS', '381'], ['SC', '248'], ['SL', '232'], ['SG', '65'], ['SX', '1'], ['SK', '421'], ['SI', '386'],
  ['SB', '677'], ['SO', '252'], ['ZA', '27'], ['KR', '82'], ['SS', '211'], ['ES', '34'], ['LK', '94'], ['SD', '249'], ['SR', '597'], ['SJ', '47'],
  ['SE', '46'], ['CH', '41'], ['SY', '963'], ['TW', '886'], ['TJ', '992'], ['TZ', '255'], ['TH', '66'], ['TL', '670'], ['TG', '228'], ['TK', '690'],
  ['TO', '676'], ['TT', '1'], ['TN', '216'], ['TR', '90'], ['TM', '993'], ['TC', '1'], ['TV', '688'], ['VI', '1'], ['UG', '256'], ['UA', '380'],
  ['AE', '971'], ['GB', '44'], ['US', '1'], ['UY', '598'], ['UZ', '998'], ['VU', '678'], ['VA', '39'], ['VE', '58'], ['VN', '84'], ['WF', '681'],
  ['EH', '212'], ['YE', '967'], ['ZM', '260'], ['ZW', '263'],
]

const names = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    return null
  }
})()

export interface Country {
  code: string
  name: string
  dial: string
}

/** Pinned first, then A–Z. */
const PINNED = ['AU', 'NZ']

export const COUNTRIES: Country[] = (() => {
  const all = DIAL.map(([code, dial]) => ({ code, dial, name: names?.of(code) ?? code }))
  const pinned = PINNED.map((c) => all.find((x) => x.code === c)!)
  return [...pinned, ...all.filter((x) => !PINNED.includes(x.code)).sort((a, b) => a.name.localeCompare(b.name))]
})()

export const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code
export const dialCode = (code: string) => COUNTRIES.find((c) => c.code === code)?.dial ?? ''

/** FIDE federation code → ISO country code (for the name). England, Scotland and Wales have their own federations. */
const FIDE_FEDS: [string, string][] = [
  ['AFG', 'AF'], ['ALB', 'AL'], ['ALG', 'DZ'], ['AND', 'AD'], ['ANG', 'AO'], ['ANT', 'AG'], ['ARG', 'AR'], ['ARM', 'AM'], ['ARU', 'AW'], ['AUS', 'AU'],
  ['AUT', 'AT'], ['AZE', 'AZ'], ['BAH', 'BS'], ['BRN', 'BH'], ['BAN', 'BD'], ['BAR', 'BB'], ['BLR', 'BY'], ['BEL', 'BE'], ['BIZ', 'BZ'], ['BEN', 'BJ'],
  ['BER', 'BM'], ['BHU', 'BT'], ['BOL', 'BO'], ['BIH', 'BA'], ['BOT', 'BW'], ['BRA', 'BR'], ['IVB', 'VG'], ['BRU', 'BN'], ['BUL', 'BG'], ['BUR', 'BF'],
  ['BDI', 'BI'], ['CAM', 'KH'], ['CMR', 'CM'], ['CAN', 'CA'], ['CPV', 'CV'], ['CAY', 'KY'], ['CAF', 'CF'], ['CHA', 'TD'], ['CHI', 'CL'], ['CHN', 'CN'],
  ['COL', 'CO'], ['COM', 'KM'], ['CGO', 'CG'], ['COD', 'CD'], ['CRC', 'CR'], ['CIV', 'CI'], ['CRO', 'HR'], ['CUB', 'CU'], ['CYP', 'CY'], ['CZE', 'CZ'],
  ['DEN', 'DK'], ['DJI', 'DJ'], ['DMA', 'DM'], ['DOM', 'DO'], ['ECU', 'EC'], ['EGY', 'EG'], ['ESA', 'SV'], ['GEQ', 'GQ'], ['ERI', 'ER'], ['EST', 'EE'],
  ['SWZ', 'SZ'], ['ETH', 'ET'], ['FAI', 'FO'], ['FIJ', 'FJ'], ['FIN', 'FI'], ['FRA', 'FR'], ['GAB', 'GA'], ['GAM', 'GM'], ['GEO', 'GE'], ['GER', 'DE'],
  ['GHA', 'GH'], ['GRE', 'GR'], ['GRN', 'GD'], ['GUM', 'GU'], ['GUA', 'GT'], ['GCI', 'GG'], ['GUY', 'GY'], ['HAI', 'HT'], ['HON', 'HN'], ['HKG', 'HK'],
  ['HUN', 'HU'], ['ISL', 'IS'], ['IND', 'IN'], ['INA', 'ID'], ['IRI', 'IR'], ['IRQ', 'IQ'], ['IRL', 'IE'], ['IOM', 'IM'], ['ISR', 'IL'], ['ITA', 'IT'],
  ['JAM', 'JM'], ['JPN', 'JP'], ['JCI', 'JE'], ['JOR', 'JO'], ['KAZ', 'KZ'], ['KEN', 'KE'], ['KOS', 'XK'], ['KUW', 'KW'], ['KGZ', 'KG'], ['LAO', 'LA'],
  ['LAT', 'LV'], ['LBN', 'LB'], ['LES', 'LS'], ['LBR', 'LR'], ['LBA', 'LY'], ['LIE', 'LI'], ['LTU', 'LT'], ['LUX', 'LU'], ['MAC', 'MO'], ['MAD', 'MG'],
  ['MAW', 'MW'], ['MAS', 'MY'], ['MDV', 'MV'], ['MLI', 'ML'], ['MLT', 'MT'], ['MTN', 'MR'], ['MRI', 'MU'], ['MEX', 'MX'], ['MDA', 'MD'], ['MNC', 'MC'],
  ['MGL', 'MN'], ['MNE', 'ME'], ['MAR', 'MA'], ['MOZ', 'MZ'], ['MYA', 'MM'], ['NAM', 'NA'], ['NRU', 'NR'], ['NEP', 'NP'], ['NED', 'NL'], ['NZL', 'NZ'],
  ['NCA', 'NI'], ['NIG', 'NE'], ['NGR', 'NG'], ['MKD', 'MK'], ['NOR', 'NO'], ['OMA', 'OM'], ['PAK', 'PK'], ['PLW', 'PW'], ['PLE', 'PS'], ['PAN', 'PA'],
  ['PNG', 'PG'], ['PAR', 'PY'], ['PER', 'PE'], ['PHI', 'PH'], ['POL', 'PL'], ['POR', 'PT'], ['PUR', 'PR'], ['QAT', 'QA'], ['ROU', 'RO'], ['RUS', 'RU'],
  ['RWA', 'RW'], ['LCA', 'LC'], ['VIN', 'VC'], ['SMR', 'SM'], ['STP', 'ST'], ['KSA', 'SA'], ['SEN', 'SN'], ['SRB', 'RS'], ['SEY', 'SC'], ['SLE', 'SL'],
  ['SGP', 'SG'], ['SVK', 'SK'], ['SLO', 'SI'], ['SOL', 'SB'], ['SOM', 'SO'], ['RSA', 'ZA'], ['KOR', 'KR'], ['SSD', 'SS'], ['ESP', 'ES'], ['SRI', 'LK'],
  ['SUD', 'SD'], ['SUR', 'SR'], ['SWE', 'SE'], ['SUI', 'CH'], ['SYR', 'SY'], ['TPE', 'TW'], ['TJK', 'TJ'], ['TAN', 'TZ'], ['THA', 'TH'], ['TLS', 'TL'],
  ['TOG', 'TG'], ['TGA', 'TO'], ['TTO', 'TT'], ['TUN', 'TN'], ['TUR', 'TR'], ['TKM', 'TM'], ['UGA', 'UG'], ['UKR', 'UA'], ['UAE', 'AE'], ['USA', 'US'],
  ['URU', 'UY'], ['ISV', 'VI'], ['UZB', 'UZ'], ['VEN', 'VE'], ['VIE', 'VN'], ['YEM', 'YE'], ['ZAM', 'ZM'], ['ZIM', 'ZW'],
]
const UK_FEDS: Federation[] = [
  { code: 'ENG', country: 'GB', name: 'England' },
  { code: 'SCO', country: 'GB', name: 'Scotland' },
  { code: 'WLS', country: 'GB', name: 'Wales' },
]

export interface Federation {
  code: string
  /** ISO country code; England, Scotland and Wales share GB. */
  country: string
  name: string
}

/** Every FIDE federation, A–Z by name. */
export const FEDERATIONS: Federation[] = [...FIDE_FEDS.map(([code, country]) => ({ code, country, name: countryName(country) })), ...UK_FEDS].sort((a, b) =>
  a.name.localeCompare(b.name),
)

/** FIDE federation for a citizenship (ISO code); Britain defaults to England. */
/** FIDE federation code for a profile citizenship (ISO 3166 alpha-2). */
export const fedCode = (citizenship: string) => (citizenship ? fedForCountry(citizenship) : '')

export const fedForCountry = (country: string) => (country === 'GB' ? 'ENG' : FEDERATIONS.find((f) => f.country === country)?.code ?? '')

export const AU_STATES =['Australian Capital Territory', 'New South Wales', 'Northern Territory', 'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia']
