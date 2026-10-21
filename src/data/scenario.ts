import type { Characteristic, Tag } from '../game/types.ts'
import { hashString, seeded } from '../game/ids.ts'
import { TECHNOLOGIES } from './technologies.ts'

/** Display-only effect of a twist on one technology. Never scored, never used by the bot. */
export interface TwistValue {
  /** Integer percent, −50..50. */
  delta: number
  reason: string
}

export interface Twist {
  id: string
  title: string
  /** Short phrase used in one-line summaries, e.g. "no water from Earth". */
  short: string
  headline: string
  world: string
  constraints: string[]
  missionImpact: string[]
  /** Shown to judges as the guide for the twist criterion. */
  judgeGuide: string
  /** Illustrative headline number for the twist graphic. */
  metric: { from: number; value: number; unit: string; label: string }
  caption: string
  /** Effect per technology family. A technology's value is the rounded mean of its matching tags. */
  tagDeltas: Partial<Record<Tag, TwistValue>>
  /** Exact per-technology values. Win over tagDeltas. */
  overrides?: Record<string, TwistValue>
}

export interface Mission {
  id: string
  title: string
  objective: string
  constraints: string[]
  success: string[]
}

const v = (delta: number, reason: string): TwistValue => ({ delta, reason })

export const TWISTS: Record<string, Twist> = {
  'water-crisis': {
    id: 'water-crisis',
    title: 'Water Crisis',
    short: 'no water from Earth',
    headline: 'Earth’s fresh water has run critically short.',
    world:
      'Prolonged droughts and failing aquifers have cut usable fresh water across every continent. Water is rationed, water-intensive industry has stalled, and nothing can be shipped off-world without justifying every litre.',
    constraints: [
      'No water can be resupplied from Earth.',
      'Every litre must be recycled, extracted locally or saved.',
      'Systems that waste water or fail without it are high risk.',
    ],
    missionImpact: [
      'Your settlement must find, extract and recycle water on Mars.',
      'Energy for melting ice and purifying water becomes a priority.',
      'Monitoring and automation that prevent leaks are worth more.',
    ],
    judgeGuide: 'Does it work with no water from Earth: extraction, recycling, saving?',
    metric: { from: 100, value: 15, unit: '%', label: 'fresh water' },
    caption: 'Fresh-water reserves, illustrative.',
    tagDeltas: {
      energy: v(10, 'Melting ice and purifying water run on power.'),
      life: v(20, 'Recycling and purification keep every litre in use.'),
      labour: v(10, 'Ice mining and pipe repair without risking crew.'),
      nav: v(10, 'Maps subsurface ice and the shortest haul routes.'),
      compute: v(20, 'Balances every litre and predicts leaks.'),
    },
    overrides: {
      electricity: v(20, 'Melting ice and purifying water run on power.'),
      'battery-storage': v(0, 'Useful, but it stores energy, not water.'),
      robotics: v(20, 'Ice mining and pipe repair without risking crew.'),
      gps: v(10, 'Maps subsurface ice and the shortest haul routes.'),
      'artificial-intelligence': v(20, 'Balances every litre and predicts leaks.'),
    },
  },
  'solar-superstorm': {
    id: 'solar-superstorm',
    title: 'Solar Superstorm',
    short: 'no satellites, radiation bursts',
    headline: "A once-in-a-millennium solar storm has fried Earth's satellites.",
    world:
      'A Carrington-class flare tore through the magnetosphere. Navigation and relay satellites burned out, power grids tripped across hemispheres, and replacing the constellation will take a decade. Anything that depends on orbiting infrastructure must now work without it.',
    constraints: [
      'No satellite positioning or relay for at least ten years.',
      'Electronics must be shielded against radiation bursts.',
      'Critical systems need power that survives sudden grid loss.',
    ],
    missionImpact: [
      'Rovers and crews must navigate by local beacons, maps and vision.',
      'Stored energy keeps life support alive through radiation events.',
      'Shielded, self-checking systems are worth more than raw capability.',
    ],
    judgeGuide: 'Does it work with no satellite navigation and survive radiation and sudden power loss?',
    metric: { from: 24, value: 0, unit: '/24', label: 'satellites online' },
    caption: 'Satellite constellation status, illustrative.',
    tagDeltas: {
      nav: v(-30, 'Satellite navigation is gone; receivers find nothing.'),
      comms: v(-30, 'Relay satellites are down; links must be local.'),
      energy: v(-10, 'Grids trip in storms; generation must be hardened.'),
      shelter: v(20, 'Shielded structures block radiation bursts.'),
      sensing: v(10, 'Radiation sensors give early warning.'),
    },
    overrides: {
      electricity: v(-10, 'Grids trip in storms; generation must be hardened.'),
      'battery-storage': v(40, 'Keeps life support running when power drops.'),
      robotics: v(10, 'Repairs radiation damage where crews cannot go.'),
      gps: v(-50, 'The constellation is gone; receivers find nothing.'),
      'artificial-intelligence': v(10, 'Navigates by vision and spots failing electronics.'),
    },
  },
  'metal-shortage': {
    id: 'metal-shortage',
    title: 'Metal Shortage',
    short: 'almost no battery or magnet metals',
    headline: 'Lithium, cobalt and rare earths have run out.',
    world:
      "Decades of demand drained the world's battery and magnet metals. Mines are exhausted, prices have frozen production, and every kilogram of critical metal sent to Mars must be justified, reused or replaced with something found there.",
    constraints: [
      'Almost no new lithium, cobalt or rare-earth metals from Earth.',
      'Hardware must be repairable and its metals recyclable.',
      'Designs that need large batteries or many motors are high risk.',
    ],
    missionImpact: [
      'Your settlement must mine or recycle metals locally.',
      'Energy must be stored or used without large battery banks.',
      'Smart scheduling and prospecting replace brute-force hardware.',
    ],
    judgeGuide: 'Does it work with minimal lithium, cobalt and rare earths: recycling, local mining, low-metal design?',
    metric: { from: 100, value: 8, unit: '%', label: 'lithium left' },
    caption: 'Critical-metal reserves, illustrative.',
    tagDeltas: {
      materials: v(-30, 'Mines are exhausted; metals must be recycled.'),
      labour: v(-20, 'Motors need rare-earth magnets; fleets must stay small.'),
      fabrication: v(20, 'Recycling and printing reuse what is already on Mars.'),
      nav: v(10, 'Finds metal-bearing ground on Mars to mine.'),
      energy: v(-10, 'Generators need metal-heavy parts.'),
    },
    overrides: {
      electricity: v(0, 'Copper wiring is still available.'),
      'battery-storage': v(-40, 'Cells need the very metals that ran out.'),
      robotics: v(-20, 'Motors need rare-earth magnets; fleets must stay small.'),
      gps: v(20, 'Finds metal-bearing ground on Mars to mine.'),
      'artificial-intelligence': v(30, 'Schedules power to need fewer batteries and finds ore.'),
    },
  },
  'crew-shortage': {
    id: 'crew-shortage',
    title: 'Crew Shortage',
    short: 'only half the crew can fly',
    headline: 'A global pandemic has grounded most of the crew.',
    world:
      'A fast-spreading virus closed training centres and quarantined launch sites. Only half the planned settlers are cleared to fly, and no replacements can follow for years. The settlement must be built and run by far fewer hands.',
    constraints: [
      'Only six of twelve planned crew can launch.',
      'No reinforcements for at least five years.',
      'Any task that needs many people is a single point of failure.',
    ],
    missionImpact: [
      'Construction and maintenance must happen without humans present.',
      'Each crew member oversees systems, not shovels.',
      'Automation and remote decision-making become essential.',
    ],
    judgeGuide: 'Does it work with half the crew: automation, remote operation, low maintenance?',
    metric: { from: 12, value: 6, unit: '/12', label: 'crew cleared' },
    caption: 'Crew manifest, illustrative.',
    tagDeltas: {
      labour: v(40, 'Machines do the work the missing crew cannot.'),
      compute: v(40, 'Automation makes decisions six people cannot cover.'),
      mobility: v(10, 'Driverless vehicles need no crew.'),
      medical: v(-10, 'Fewer doctors to cover more care.'),
    },
    overrides: {
      electricity: v(10, 'Every automated job runs on power.'),
      'battery-storage': v(10, 'Lets machines work through the night unattended.'),
      robotics: v(40, 'Builds and repairs in place of the missing crew.'),
      gps: v(10, 'Guides autonomous vehicles without a driver.'),
      'artificial-intelligence': v(40, 'Makes the decisions six people cannot cover.'),
    },
  },
  'earth-silence': {
    id: 'earth-silence',
    title: 'Earth Silence',
    short: 'no contact with Earth',
    headline: 'Mission control on Earth has gone dark.',
    world:
      "A collapse of Earth's deep-space network has cut contact with Mars. There are no instructions, no software updates and no expert help: the settlement hears nothing back, perhaps for years, and must decide everything itself.",
    constraints: [
      'No communication with Earth for an unknown period.',
      'No remote diagnosis, updates or expert advice.',
      'Every decision and repair must be made on Mars.',
    ],
    missionImpact: [
      'The settlement needs its own decision-making and fault diagnosis.',
      "Local navigation and timing must replace Earth's signals.",
      'Systems that wait for orders from Earth will stall.',
    ],
    judgeGuide: 'Does it work with zero contact with Earth: local decisions, diagnosis and repair?',
    metric: { from: 100, value: 0, unit: '%', label: 'link strength' },
    caption: 'Earth–Mars link strength, illustrative.',
    tagDeltas: {
      compute: v(30, 'Local decision-making replaces Earth expertise.'),
      comms: v(-40, 'The Earth link is gone; nothing arrives from home.'),
      nav: v(-20, 'Earth-run timing and updates are lost; it must be rebuilt locally.'),
      labour: v(20, 'Carries out repairs no one on Earth can guide.'),
      energy: v(10, 'Still essential, but unchanged by the silence.'),
    },
    overrides: {
      electricity: v(0, 'Still essential, but unchanged by the silence.'),
      'battery-storage': v(10, 'Buys time while the crew solves problems alone.'),
      robotics: v(20, 'Carries out repairs no one on Earth can guide.'),
      gps: v(-20, 'Earth-run timing and updates are lost; it must be rebuilt locally.'),
      'artificial-intelligence': v(40, "Replaces mission control's diagnosis and planning."),
    },
  },
  'dust-winter': {
    id: 'dust-winter',
    title: 'Dust Winter',
    short: 'sunlight cut for months',
    headline: 'Global dust storms have blotted out the sun for months.',
    world:
      'A planet-wide storm lifts fine dust high into the atmosphere, and sunlight at the surface falls to a fraction of normal for most of a Martian year. Solar panels produce little, greenhouses go dim and the cold deepens.',
    constraints: [
      'Surface sunlight is down 90% for months at a time.',
      'Solar generation cannot be relied on for the whole season.',
      'Crops need artificial light or stored energy.',
    ],
    missionImpact: [
      'Stored energy and power generation must carry the settlement through the dark months.',
      'Growing food indoors becomes a first priority.',
      'Systems that rely on sunlight need backups.',
    ],
    judgeGuide: 'Does it keep power and food going with almost no sunlight for months?',
    metric: { from: 100, value: 10, unit: '%', label: 'sunlight at surface' },
    caption: 'Surface sunlight, illustrative.',
    tagDeltas: {
      energy: v(-10, 'Less sunlight; most generation needs fuel or stored power.'),
      life: v(-20, 'Greenhouses go dim; food must be grown under artificial light.'),
      bio: v(-10, 'Plant growth slows without light.'),
      shelter: v(10, 'Sealed, insulated shelters hold heat through the dust.'),
      sensing: v(10, 'Sensors track storm fronts and clearing.'),
    },
    overrides: {
      'solar-photovoltaics': v(-50, 'Panels make almost no power under the dust.'),
      'battery-storage': v(40, 'Stored energy carries life support through the dark months.'),
    },
  },
  'pandemic-aboard': {
    id: 'pandemic-aboard',
    title: 'Pandemic Aboard',
    short: 'an outbreak in the crew',
    headline: 'An infection is spreading through the settlement.',
    world:
      'A contagious illness has reached the habitat. Quarantine splits the crew, hospital beds fill, and no vaccine stock can arrive from Earth for years.',
    constraints: [
      'Half the crew may need to isolate at any time.',
      'No medicine resupply from Earth.',
      'Shared air and water must be kept free of pathogens.',
    ],
    missionImpact: [
      'Medical capability must be made on Mars.',
      'Sealed, clean habitat design matters more than size.',
      'Remote monitoring keeps isolated crew safe.',
    ],
    judgeGuide: 'Does it protect the crew from infection and treat the sick with no resupply?',
    metric: { from: 100, value: 40, unit: '%', label: 'crew working' },
    caption: 'Crew available for duty, illustrative.',
    tagDeltas: {
      medical: v(40, 'Treats and diagnoses the infection on site.'),
      bio: v(30, 'Makes antibiotics and vaccines from local cultures.'),
      life: v(20, 'Clean water and air keep pathogens out.'),
      sensing: v(20, 'Detects pathogens early in air and water.'),
      shelter: v(20, 'Sealed modules isolate the sick.'),
      compute: v(10, 'Tracks contacts and flags outbreaks.'),
    },
    overrides: {
      vaccines: v(60, 'Stops the outbreak spreading once made locally.'),
    },
  },
  'reactor-ban': {
    id: 'reactor-ban',
    title: 'Reactor Ban',
    short: 'no fission reactors',
    headline: 'Nuclear power has been banned worldwide.',
    world:
      'After a series of accidents, every government has banned new fission reactors and shut down existing plants. Any power system that depends on reactor fuel or licences is off the table for the foreseeable future.',
    constraints: [
      'No new fission reactors may be launched.',
      'Reactor fuel and spares cannot be shipped from Earth.',
      'Power systems must be fuelled or built from local resources.',
    ],
    missionImpact: [
      'Power must come from sun, wind, chemistry or storage.',
      'Energy storage and generation carry more weight.',
      'Designs that need fissile material are high risk.',
    ],
    judgeGuide: 'Does it provide power without any fission reactor or reactor fuel?',
    metric: { from: 100, value: 0, unit: '%', label: 'reactor licences' },
    caption: 'Reactor licences, illustrative.',
    tagDeltas: {
      energy: v(10, 'Other generation sources are now the only route to power.'),
      life: v(10, 'Fuel cells and electrolysis fill the gap.'),
      materials: v(-10, 'Reactor-grade alloys and shielding are unavailable.'),
      mobility: v(-10, 'Nuclear-powered transport is grounded.'),
      labour: v(10, 'Automation runs on the power that remains.'),
    },
    overrides: {
      'nuclear-fission': v(-50, 'Banned outright; no reactor can be built or fuelled.'),
    },
  },
  'regolith-toxic': {
    id: 'regolith-toxic',
    title: 'Toxic Regolith',
    short: 'perchlorate soil',
    headline: 'The local soil is toxic to plants and people.',
    world:
      'Early samples show the surface dust carries perchlorate salts, which harm the thyroid and poison most plant roots. Digging, moving or breathing soil must be controlled, and nothing grown in native dirt can be eaten unwashed.',
    constraints: [
      'Native soil cannot be used for growing food without treatment.',
      'Dust must be kept out of living spaces.',
      'Washing and cleaning need reliable water and energy.',
    ],
    missionImpact: [
      'Crops must grow in treated soil, hydroponics or sealed beds.',
      'Dust control and filtration become core systems.',
      'Mining and construction need methods that limit dust.',
    ],
    judgeGuide: 'Does it keep soil toxins out of food, air and people?',
    metric: { from: 100, value: 5, unit: '%', label: 'soil safe for crops' },
    caption: 'Soil toxicity survey, illustrative.',
    tagDeltas: {
      life: v(20, 'Soil-free growing and water washing avoid the toxins.'),
      bio: v(-20, 'Native soil microbes and plants are poisoned.'),
      materials: v(-10, 'Local regolith cannot be used raw in building.'),
      fabrication: v(20, 'Printers make parts that keep dust out of the habitat.'),
      medical: v(20, 'Filters and treatments remove toxins from the body.'),
    },
    overrides: {
      hydroponics: v(50, 'Grows food with no contact with native soil.'),
    },
  },
  'launch-window-missed': {
    id: 'launch-window-missed',
    title: 'Launch Window Missed',
    short: 'no resupply for 26 months',
    headline: 'The next resupply window has been missed.',
    world:
      'A fault at the launch site pushed the next cargo flight back. Earth and Mars are out of alignment, so the next launch window is 26 months away. The settlement must live off what it already has.',
    constraints: [
      'No resupply of any kind for 26 months.',
      'Spare parts must be made or repaired on site.',
      'Every consumable must be recycled or extended.',
    ],
    missionImpact: [
      'Repair and fabrication matter more than new hardware.',
      'Recycling loops for air, water and materials are essential.',
      'Systems that wear out without spares are high risk.',
    ],
    judgeGuide: 'Does it run and repair itself for two years with no resupply?',
    metric: { from: 26, value: 0, unit: ' months', label: 'until next resupply' },
    caption: 'Resupply countdown, illustrative.',
    tagDeltas: {
      fabrication: v(30, 'Printers and machine shops make spare parts on site.'),
      materials: v(20, 'Recycled metal and regolith replace shipped stock.'),
      life: v(20, 'Closed-loop life support recycles air and water.'),
      labour: v(10, 'Maintenance crews keep the stock running.'),
      mobility: v(-20, 'Vehicles cannot be replaced; parts wear out.'),
      compute: v(10, 'Diagnostics find faults before they break.'),
    },
  },
  'quake-swarm': {
    id: 'quake-swarm',
    title: 'Quake Swarm',
    short: 'constant tremors',
    headline: 'A swarm of marsquakes is shaking the landing zone.',
    world:
      'Seismometers record hundreds of tremors in a single month. Structures must flex without cracking, buried pipes can rupture, and the crew cannot predict when the next shock will hit.',
    constraints: [
      'Tremors arrive without warning, several times a day.',
      'Structures must survive shaking without repair crews on hand.',
      'Buried services are at risk of rupture.',
    ],
    missionImpact: [
      'Habitats must be flexible and anchored.',
      'Monitoring and automatic shutdown protect people and equipment.',
      'Pipes and cables need redundancy and flexible joints.',
    ],
    judgeGuide: 'Does it survive repeated tremors and keep running afterwards?',
    metric: { from: 12, value: 340, unit: '', label: 'tremors this month' },
    caption: 'Seismic log, illustrative.',
    tagDeltas: {
      shelter: v(20, 'Flexible, anchored structures ride out shaking.'),
      sensing: v(30, 'Seismometers give early warning of tremors.'),
      labour: v(10, 'Robots can inspect and repair after each shock.'),
      materials: v(-10, 'Brittle materials crack under repeated shaking.'),
      fabrication: v(10, 'Printed flexible joints replace rigid parts.'),
      energy: v(-10, 'Power and fuel lines can snap.'),
    },
    overrides: {
      'concrete-regolith': v(-30, 'Masonry cracks under repeated shaking.'),
    },
  },
  'oxygen-leak': {
    id: 'oxygen-leak',
    title: 'Oxygen Leak',
    short: 'a sealed module is venting air',
    headline: 'A pressure seal has failed and oxygen is escaping.',
    world:
      'A hull seam in the main habitat has cracked and is venting breathable air into the thin Martian atmosphere. The crew must find and seal the leak, keep oxygen generation running and watch every module for pressure loss.',
    constraints: [
      'Breathable air is lost faster than it is made.',
      'Sealing materials and spare seals are limited.',
      'Crew must wear suits in the affected module.',
    ],
    missionImpact: [
      'Oxygen generation and air recovery become the top priority.',
      'Pressure and leak sensing must cover every module.',
      'Sealed compartments and emergency isolation are worth more.',
    ],
    judgeGuide: 'Does it keep the air breathable through a leak with limited sealing material?',
    metric: { from: 21, value: 15, unit: '%', label: 'oxygen in habitat air' },
    caption: 'Cabin oxygen level, illustrative.',
    tagDeltas: {
      life: v(30, 'Makes oxygen and recovers air lost through the leak.'),
      sensing: v(20, 'Finds leaks through pressure and gas monitoring.'),
      shelter: v(20, 'Sealed, compartmented modules limit the loss.'),
      fabrication: v(10, 'Printers make replacement seals and fittings.'),
      materials: v(10, 'Stronger seal materials hold pressure longer.'),
    },
    overrides: {
      'pressure-suit': v(30, 'Keeps each crew member breathing while the leak is sealed.'),
      'inflatable-habitat': v(-20, 'Soft walls are the weakest seal in the habitat.'),
    },
  },
  'ai-recall': {
    id: 'ai-recall',
    title: 'AI Recall',
    short: 'no autonomous software',
    headline: 'Regulators have recalled every autonomous AI system.',
    world:
      'A string of failures has led Earth to withdraw all autonomous decision-making software from service. Humans must check every control decision, and software updates are frozen until safety reviews finish.',
    constraints: [
      'No autonomous software may make control decisions.',
      'Every automated action needs human approval.',
      'No software updates can be shipped for several years.',
    ],
    missionImpact: [
      'The crew must confirm every machine decision by hand.',
      'Simple, transparent controls beat clever ones.',
      'Machines that work without AI logic gain value.',
    ],
    judgeGuide: 'Does it run safely with no autonomous AI decision-making?',
    metric: { from: 100, value: 0, unit: '%', label: 'autonomous control' },
    caption: 'Autonomy level, illustrative.',
    tagDeltas: {
      compute: v(-30, 'Software-driven decision-making is withdrawn.'),
      labour: v(-20, 'Autonomous machines must wait for human approval.'),
      mobility: v(-20, 'Autonomous vehicles must be driven or checked by hand.'),
      nav: v(10, 'Simple, proven positioning stays in service.'),
      life: v(10, 'Manual life-support controls stay fully working.'),
    },
    overrides: {
      'artificial-intelligence': v(-50, 'Banned: the software cannot make control decisions.'),
      drone: v(-30, 'Flights need a pilot at every step.'),
    },
  },
  'population-boom': {
    id: 'population-boom',
    title: 'Population Boom',
    short: 'twice the planned crew',
    headline: 'The settlement has been asked to take twice the crew.',
    world:
      'A political deal promised a second wave of settlers. Living space, food and water must now stretch to twice the original headcount, with no extra supply on the first flight.',
    constraints: [
      'The settlement must support twice the planned crew.',
      'Food, water and air needs double immediately.',
      'Housing and medical beds must expand quickly.',
    ],
    missionImpact: [
      'Growth must be modular: more units added, not redesigned.',
      'Food and water production must scale up.',
      'Systems designed for a small crew will overload.',
    ],
    judgeGuide: 'Does it scale from the planned crew to twice that size without redesign?',
    metric: { from: 12, value: 24, unit: '', label: 'settlers' },
    caption: 'Settler manifest, illustrative.',
    tagDeltas: {
      shelter: v(30, 'Modular habitats add living space quickly.'),
      life: v(20, 'Scalable recycling handles the extra people.'),
      fabrication: v(20, 'Printers make new housing and parts on demand.'),
      medical: v(10, 'Clinics and telemedicine scale to more patients.'),
      energy: v(-20, 'Power demand doubles with the crew.'),
      compute: v(10, 'Automation handles more work per person.'),
    },
    overrides: {
      'inflatable-habitat': v(40, 'Expands quickly and packs flat for the trip.'),
    },
  },
  'cold-snap': {
    id: 'cold-snap',
    title: 'Cold Snap',
    short: 'nights at −120 °C',
    headline: 'Night temperatures have dropped to −120 °C.',
    world:
      'An unusually cold season has pushed night temperatures far below the planned minimum. Pipes, batteries and seals stiffen or fail, and heating eats into the power budget.',
    constraints: [
      'Nights fall to −120 °C for weeks at a time.',
      'Heating must run through the night.',
      'Seals, pipes and batteries must work in extreme cold.',
    ],
    missionImpact: [
      'Insulation and heat retention become critical.',
      'Heating draws heavily on power, so energy must scale up.',
      'Cold-tolerant materials and components are required.',
    ],
    judgeGuide: 'Does it keep working at −120 °C nights with its heating budget?',
    metric: { from: -60, value: -120, unit: ' °C', label: 'night low' },
    caption: 'Night temperature, illustrative.',
    tagDeltas: {
      shelter: v(20, 'Insulated shelters hold heat through the night.'),
      materials: v(-10, 'Many metals and seals turn brittle in the cold.'),
      energy: v(-20, 'Heating drains the power budget every night.'),
      life: v(10, 'Life support must be kept warm and working.'),
      mobility: v(-20, 'Vehicles lose range in extreme cold.'),
    },
    overrides: {
      'battery-storage': v(-30, 'Cells lose capacity fast below −60 °C.'),
      'aerogel-insulation': v(40, 'Excellent insulation cuts heating loads sharply.'),
    },
  },
  'fuel-famine': {
    id: 'fuel-famine',
    title: 'Fuel Famine',
    short: 'no chemical fuel from Earth',
    headline: 'Rocket propellant and fuel reserves are running dry.',
    world:
      'The fuel plants that were to supply the settlement have stalled. Chemical propellant and fuel stock cannot be sent from Earth, so vehicles, heating and backup generators must run on what can be made locally.',
    constraints: [
      'No chemical fuel or propellant from Earth.',
      'Vehicles and backup generators need local fuel or power.',
      'Fuel production must not use scarce materials.',
    ],
    missionImpact: [
      'The settlement must make its own fuel or switch to electric power.',
      'Vehicles and equipment must be efficient or electric.',
      'Energy conversion from local sources becomes essential.',
    ],
    judgeGuide: 'Does it run vehicles and generators without imported fuel?',
    metric: { from: 100, value: 12, unit: '%', label: 'fuel reserve' },
    caption: 'Fuel reserve, illustrative.',
    tagDeltas: {
      energy: v(20, 'Local power replaces imported fuel.'),
      mobility: v(-20, 'Fuel-hungry vehicles are stranded.'),
      labour: v(-10, 'Fuel-powered machines stop.'),
      materials: v(10, 'Local metals can be recycled into fuel-cell parts.'),
      life: v(10, 'Local water and air supplies feed fuel production.'),
    },
    overrides: {
      electrolysis: v(40, 'Splits local water into hydrogen and oxygen for propellant.'),
      rocketry: v(-50, 'Rockets cannot fly without imported propellant.'),
    },
  },
  'budget-cut': {
    id: 'budget-cut',
    title: 'Budget Cut',
    short: 'half the cargo mass',
    headline: 'The next cargo ship can carry only half its planned load.',
    world:
      'Funding has been cut and the launch vehicle must carry lighter payloads. Every kilogram is tested against its value, and bulky or heavy systems are the first to go.',
    constraints: [
      'Half the planned cargo mass can be launched.',
      'Heavy systems are the first to be cut.',
      'No new budget for shipping will be approved.',
    ],
    missionImpact: [
      'Light, compact technologies are worth more.',
      'Local manufacturing replaces shipped parts.',
      'Bulky infrastructure must be built from local materials.',
    ],
    judgeGuide: 'Does it deliver the mission on half the cargo mass?',
    metric: { from: 100, value: 50, unit: '%', label: 'cargo mass allowed' },
    caption: 'Launch mass allowance, illustrative.',
    tagDeltas: {
      materials: v(20, 'Local materials replace heavy shipped stock.'),
      fabrication: v(20, 'Printing parts on site avoids launching them.'),
      compute: v(10, 'Compact electronics save mass.'),
      energy: v(-10, 'Heavy power plants cannot be launched.'),
      mobility: v(-20, 'Heavy vehicles are cut from the manifest.'),
      shelter: v(-10, 'Heavy structures must be built from local material.'),
    },
    overrides: {
      'nuclear-fission': v(-40, 'A reactor is the heaviest item on the manifest and is cut.'),
    },
  },
  'second-colony-rivalry': {
    id: 'second-colony-rivalry',
    title: 'Second Colony Rivalry',
    short: 'a rival settlement competes for the same ice',
    headline: 'A rival settlement has landed a few hundred kilometres away.',
    world:
      'A rival power has set up a second colony and is claiming the same ice fields and minerals. Access to resources is now contested, and trade and cooperation are uncertain.',
    constraints: [
      'A rival colony claims the same ice and mineral sites.',
      'Resource access can be cut off at any time.',
      'Information about the rival is limited.',
    ],
    missionImpact: [
      'Resource claims and self-sufficiency become strategic.',
      'Surveying and mapping of rival activity matter.',
      'Systems that depend on shared resources are risky.',
    ],
    judgeGuide: 'Does it secure resources without depending on the rival colony?',
    metric: { from: 1, value: 2, unit: '', label: 'colonies on Mars' },
    caption: 'Colonies on the planet, illustrative.',
    tagDeltas: {
      nav: v(20, 'Maps the rival and the contested resource sites.'),
      sensing: v(20, 'Watches rival activity from orbit and ground.'),
      comms: v(10, 'Keeps the settlement in contact with its own supply lines.'),
      materials: v(10, 'Local materials remove the need to trade.'),
      mobility: v(10, 'Rovers reach claims before the rival.'),
    },
    overrides: {
      'satellite-relay': v(30, 'Gives a private link no rival can cut.'),
    },
  },
  'meteor-strike': {
    id: 'meteor-strike',
    title: 'Meteor Strike',
    short: 'the main habitat is wrecked',
    headline: 'A meteor has struck the main habitat.',
    world:
      'A fragment from a dust-cloud impact punched through the main habitat’s roof. Part of the living quarters is open to the air, equipment is damaged, and the crew must repair the structure before the next cold night.',
    constraints: [
      'The main habitat is partly open to the atmosphere.',
      'Repair must start within hours.',
      'Replacement structural parts are not on hand.',
    ],
    missionImpact: [
      'Emergency repair and reconstruction take priority.',
      'Structures must be rebuilt with local materials.',
      'Automation and robotic repair save crew lives.',
    ],
    judgeGuide: 'Does it rebuild the habitat quickly with local materials and robots?',
    metric: { from: 100, value: 35, unit: '%', label: 'habitat intact' },
    caption: 'Habitat integrity, illustrative.',
    tagDeltas: {
      shelter: v(30, 'Structures can be rebuilt quickly on site.'),
      labour: v(30, 'Machines do the rebuilding fast.'),
      fabrication: v(30, 'Printers make replacement panels and parts.'),
      materials: v(20, 'Local materials replace the lost structure.'),
      sensing: v(10, 'Inspects the damage and finds weak points.'),
      mobility: v(-10, 'Vehicles are needed for hauling and may be damaged.'),
    },
    overrides: {
      'inflatable-habitat': v(-40, 'The soft shell is the part most likely to fail.'),
    },
  },
  sabotage: {
    id: 'sabotage',
    title: 'Sabotage',
    short: 'a rogue crew member has corrupted systems',
    headline: 'A crew member has been secretly sabotaging critical systems.',
    world:
      'Logs show deliberate changes to valves, power routing and control software. The saboteur is locked out, but the settlement does not know which other systems were touched or whether its controls can be trusted.',
    constraints: [
      'Some control systems may be corrupted.',
      'Every control decision must be verified independently.',
      'Trust must be rebuilt in key systems.',
    ],
    missionImpact: [
      'Independent checks and audit trails are required.',
      'Systems must fail safely and be easy to inspect.',
      'Hardware that cannot be tampered with is valuable.',
    ],
    judgeGuide: 'Does it detect, contain and recover from sabotage on a closed network?',
    metric: { from: 100, value: 60, unit: '%', label: 'systems trusted' },
    caption: 'Systems verified, illustrative.',
    tagDeltas: {
      compute: v(-20, 'Shared software is the route the saboteur used.'),
      comms: v(-20, 'Networks spread a corrupted command quickly.'),
      sensing: v(20, 'Independent sensors check what the controls report.'),
      energy: v(-10, 'Power routing could be altered.'),
      labour: v(10, 'Mechanical and manual systems cannot be altered remotely.'),
      life: v(10, 'Manual overrides keep air and water safe.'),
    },
    overrides: {
      'blockchain-ledger': v(40, 'A tamper-evident ledger records every command.'),
      'artificial-intelligence': v(-30, 'Autonomous control is the easiest route for corrupt commands.'),
    },
  },
  'corporate-takeover': {
    id: 'corporate-takeover',
    title: 'Corporate Takeover',
    short: 'patents locked, licensed tech only',
    headline: 'A single company now owns the patents to most key technologies.',
    world:
      'A corporate takeover has put many core technologies under restrictive licences. Settlements may run only what they are licensed to run, and cannot repair, copy or modify it without paying and waiting for approval.',
    constraints: [
      'Most technologies can be operated only under licence.',
      'Repairs and modifications need the licensor’s permission.',
      'Licences cost coins and take months to approve.',
    ],
    missionImpact: [
      'Open, repairable designs are worth far more.',
      'Local design and manufacturing matter less than legal access.',
      'Systems you can repair yourself gain value.',
    ],
    judgeGuide: 'Does it run and repair without relying on locked, licensed technology?',
    metric: { from: 100, value: 20, unit: '%', label: 'technology you may modify' },
    caption: 'Licensed technology share, illustrative.',
    tagDeltas: {
      compute: v(-20, 'Proprietary chips and software are locked.'),
      medical: v(-20, 'Patented drugs and devices need licences.'),
      bio: v(-10, 'Patented strains cannot be copied.'),
      fabrication: v(20, 'Open printing designs can be repaired locally.'),
      comms: v(-10, 'Licensed network stacks cost extra.'),
    },
    overrides: {
      crispr: v(-40, 'Gene-editing patents are tightly controlled.'),
      hydroponics: v(20, 'Open growing methods need no licence.'),
    },
  },
  cyberattack: {
    id: 'cyberattack',
    title: 'Cyberattack',
    short: 'every networked system compromised',
    headline: 'Every networked system at the settlement has been compromised.',
    world:
      'Malicious code has spread through every connected device, from air controllers to rover fleets. Restoring safe operation means isolating networks, rebuilding systems and checking every device by hand.',
    constraints: [
      'Every connected device must be treated as untrusted.',
      'Networks must be isolated while systems are rebuilt.',
      'Restoring service must not restore the malware.',
    ],
    missionImpact: [
      'Air-gapped and simple systems are safer than connected ones.',
      'Manual controls and checks must stay in service.',
      'Redundant, offline backups are essential.',
    ],
    judgeGuide: 'Does it stay safe and recover when every networked system is compromised?',
    metric: { from: 100, value: 0, unit: '%', label: 'networked systems trusted' },
    caption: 'Network trust, illustrative.',
    tagDeltas: {
      comms: v(-30, 'Networks must be cut off until rebuilt.'),
      compute: v(-30, 'Compromised software must be wiped and rebuilt.'),
      nav: v(-10, 'Positioning data may be spoofed.'),
      energy: v(-10, 'Grid controls are networked.'),
      labour: v(10, 'Mechanical machines are not on the network.'),
      life: v(10, 'Manual life-support controls keep working offline.'),
    },
    overrides: {
      internet: v(-50, 'The network is the attack surface.'),
    },
  },
  'crop-blight': {
    id: 'crop-blight',
    title: 'Crop Blight',
    short: 'a fungus kills the plants',
    headline: 'A fast-spreading fungus has destroyed the crops.',
    world:
      'A fungus introduced with imported seed stock has spread through every growing bay. Plants wilt within days, and the settlement must stop the spread, clean every system and restart food production from sterile stock.',
    constraints: [
      'Every growing bay is contaminated.',
      'Fresh seed stock cannot be shipped from Earth for years.',
      'Growing systems must be sterilised before replanting.',
    ],
    missionImpact: [
      'Food production must restart in sealed, sterile systems.',
      'Biological safety and monitoring are critical.',
      'Food stores must be stretched while crops recover.',
    ],
    judgeGuide: 'Does it restore food production from sterile stock and stop the spread?',
    metric: { from: 100, value: 0, unit: '%', label: 'crops standing' },
    caption: 'Crop health, illustrative.',
    tagDeltas: {
      life: v(-10, 'Plant-based systems need sterile restarts.'),
      bio: v(-30, 'Biological systems carry the fungus.'),
      medical: v(20, 'Diagnosis and antifungal treatment.'),
      sensing: v(20, 'Detects spores and infected plants early.'),
      fabrication: v(10, 'Sterile printed growing trays avoid contamination.'),
      materials: v(10, 'Sealed, cleanable surfaces resist spores.'),
    },
    overrides: {
      hydroponics: v(-30, 'Shared nutrient water carries the blight fast.'),
      'composting-bioreactor': v(-40, 'Compost heaps feed the fungus.'),
    },
  },
  'ice-runs-dry': {
    id: 'ice-runs-dry',
    title: 'Ice Runs Dry',
    short: 'the ice deposit is smaller than mapped',
    headline: 'The ice deposit is only a fraction of what was mapped.',
    world:
      'Core drilling has found that the ice field is thin and patchy. Water extraction will have to reach deeper and farther, and the supply will not last as long as planned.',
    constraints: [
      'Usable ice is a fraction of the mapped estimate.',
      'Extraction must reach deeper and farther than planned.',
      'Water recovery must be far more efficient.',
    ],
    missionImpact: [
      'Water recycling and purification matter more.',
      'Prospecting and mapping must target richer deposits.',
      'Energy for deep drilling and melting rises.',
    ],
    judgeGuide: 'Does it deliver water when the ice deposit is much smaller than planned?',
    metric: { from: 100, value: 30, unit: '%', label: 'mapped ice usable' },
    caption: 'Usable ice estimate, illustrative.',
    tagDeltas: {
      life: v(30, 'Water recovery and purification stretch the supply.'),
      nav: v(20, 'Mapping finds deeper and richer ice.'),
      sensing: v(20, 'Ground-penetrating scans locate ice.'),
      energy: v(-10, 'Deep drilling and melting need more power.'),
      labour: v(10, 'Robotic drills reach remote ice.'),
      materials: v(-10, 'Drilling wears equipment faster.'),
    },
    overrides: {
      'water-purification': v(40, 'Recovers most of the water that is left.'),
    },
  },
  'power-grid-cascade': {
    id: 'power-grid-cascade',
    title: 'Power Grid Cascade',
    short: 'one fault takes down every circuit',
    headline: 'A single fault has cascaded through the whole power grid.',
    world:
      'A failed relay set off a chain reaction that tripped every circuit in the settlement. Power is restored in pieces, and the crew must find a way to stop a single fault from taking everything down.',
    constraints: [
      'A single fault can take down the whole grid.',
      'Power must be restored in stages.',
      'Critical loads must survive a total blackout.',
    ],
    missionImpact: [
      'Power must be split into independent, protected zones.',
      'Local storage keeps life support alive during faults.',
      'Fast fault detection and isolation are essential.',
    ],
    judgeGuide: 'Does it survive a total grid failure and restore power safely?',
    metric: { from: 100, value: 15, unit: '%', label: 'circuits powered' },
    caption: 'Grid status, illustrative.',
    tagDeltas: {
      energy: v(-10, 'Centralised generation fails as one.'),
      compute: v(10, 'Fast controls isolate faults.'),
      sensing: v(20, 'Monitors detect faults before they cascade.'),
      labour: v(10, 'Crews can switch loads and repair by hand.'),
      life: v(10, 'Life support is kept on protected circuits.'),
    },
    overrides: {
      'battery-storage': v(40, 'Keeps critical loads running while the grid recovers.'),
      electricity: v(-20, 'One grid means one point of failure.'),
    },
  },
  'lost-knowledge': {
    id: 'lost-knowledge',
    title: 'Lost Knowledge',
    short: 'manuals and databases erased',
    headline: 'The settlement’s manuals and databases have been erased.',
    world:
      'A failed storage array wiped the technical library and most operating databases. Procedures, specifications and maintenance histories must be rebuilt from memory, partial copies and whatever the crew can recover.',
    constraints: [
      'Technical manuals and databases are lost.',
      'Partial backups may be corrupt.',
      'No copies can be sent from Earth for years.',
    ],
    missionImpact: [
      'Simple, self-explaining systems are worth more.',
      'Knowledge must be captured and stored in several places.',
      'Automated procedures help crews work without manuals.',
    ],
    judgeGuide: 'Does it keep working when its manuals and databases are gone?',
    metric: { from: 100, value: 20, unit: '%', label: 'records recovered' },
    caption: 'Recovered records, illustrative.',
    tagDeltas: {
      compute: v(-20, 'Databases and models must be rebuilt.'),
      comms: v(-10, 'Shared catalogues are gone.'),
      labour: v(10, 'Machines that work from simple routines still run.'),
      medical: v(-10, 'Clinical records are lost.'),
      materials: v(10, 'Known, simple materials need no records.'),
    },
    overrides: {
      'artificial-intelligence': v(20, 'Rebuilds procedures from partial records and observation.'),
      microchip: v(-10, 'Chip designs and test records are lost.'),
    },
  },
  'low-gravity-health': {
    id: 'low-gravity-health',
    title: 'Low-Gravity Health',
    short: 'bone and muscle loss',
    headline: 'Crew are losing bone and muscle faster than expected.',
    world:
      'Years at a third of Earth’s gravity have caused bone density and muscle strength to fall far faster than models predicted. Crew must exercise hard, and their capacity for work is falling.',
    constraints: [
      'Crew lose bone and muscle strength at high speed.',
      'Exercise equipment takes power and space.',
      'Work time per person is limited.',
    ],
    missionImpact: [
      'Health monitoring and treatment become essential.',
      'Heavy labour is done by machines, not people.',
      'Exercise and medical systems take a share of power and space.',
    ],
    judgeGuide: 'Does it keep the crew healthy and productive in low gravity?',
    metric: { from: 100, value: 70, unit: '%', label: 'crew strength' },
    caption: 'Crew strength index, illustrative.',
    tagDeltas: {
      medical: v(30, 'Monitors and treats bone and muscle loss.'),
      labour: v(30, 'Machines and exoskeletons take the heavy lifting.'),
      life: v(10, 'Nutrition and clean water support recovery.'),
      energy: v(-10, 'Exercise and medical equipment need power.'),
      sensing: v(10, 'Tracks crew health and fatigue.'),
    },
    overrides: {
      exoskeleton: v(40, 'Supports the body in heavy tasks without damaging muscles.'),
    },
  },
  'refugee-ship': {
    id: 'refugee-ship',
    title: 'Refugee Ship',
    short: '40 extra people arrive',
    headline: 'A damaged ship has arrived with 40 extra people aboard.',
    world:
      'A stricken transport has docked with forty survivors who need shelter, food and medical care. Taking them in is a humanitarian duty, and the settlement must absorb them without its supplies collapsing.',
    constraints: [
      'Forty extra people must be housed and fed at once.',
      'Supplies cannot be replenished for years.',
      'The arriving ship has limited spares.',
    ],
    missionImpact: [
      'Housing, food and water capacity must expand at once.',
      'Medical and sanitation capacity is stretched.',
      'Modular, scalable systems are worth more.',
    ],
    judgeGuide: 'Does it absorb 40 extra people while keeping everyone supplied?',
    metric: { from: 12, value: 52, unit: '', label: 'people on site' },
    caption: 'Population on site, illustrative.',
    tagDeltas: {
      shelter: v(30, 'Quick-build housing takes the new arrivals.'),
      medical: v(20, 'Clinics treat the injured survivors.'),
      life: v(20, 'Water and air systems expand to cover more people.'),
      energy: v(-20, 'Demand jumps with the extra people.'),
      fabrication: v(10, 'Printers make beds, parts and fittings.'),
    },
    overrides: {
      'inflatable-habitat': v(40, 'Adds living space in days, not months.'),
    },
  },
  'sky-elevator-collapse': {
    id: 'sky-elevator-collapse',
    title: 'Sky Elevator Collapse',
    short: 'heavy-lift supply lost',
    headline: 'The orbital supply tether has collapsed, cutting heavy-lift deliveries.',
    world:
      'The tether that would have carried heavy cargo down to the surface has snapped under load. Heavy cargo can no longer be delivered, and anything too large for a rocket must be built on Mars.',
    constraints: [
      'No heavy cargo can be delivered by tether.',
      'Only small, light loads can arrive by rocket.',
      'Large structures must be built from local materials.',
    ],
    missionImpact: [
      'Large equipment must be made locally.',
      'Light, high-value imports are prioritised.',
      'Construction methods that use local materials become essential.',
    ],
    judgeGuide: 'Does it build what it needs from local materials with only light deliveries?',
    metric: { from: 100, value: 10, unit: '%', label: 'heavy cargo capacity' },
    caption: 'Heavy-lift capacity, illustrative.',
    tagDeltas: {
      materials: v(30, 'Local materials replace heavy imported stock.'),
      fabrication: v(30, 'Printers and smelters make large parts locally.'),
      shelter: v(20, 'Structures are built from local material.'),
      mobility: v(-20, 'Heavy vehicles cannot be delivered.'),
      labour: v(10, 'Machines lift and assemble on site.'),
      energy: v(-10, 'Large power plants cannot be delivered.'),
    },
    overrides: {
      'lever-pulley-cranes': v(30, 'Simple cranes and rigging need no imported power.'),
      rocketry: v(-40, 'Launch vehicles depend on the heavy-lift supply line.'),
    },
  },
  'long-night': {
    id: 'long-night',
    title: 'Long Night',
    short: 'winter nights doubled',
    headline: 'An orbital shift has doubled the length of the Martian winter nights.',
    world:
      'A change in the planet’s orbital pattern has stretched the winter nights, so the settlement must survive twice as many hours without sunlight each day. Power, heat and food must all carry through much longer dark periods.',
    constraints: [
      'Night lasts twice as long for months at a time.',
      'Solar generation is unavailable for much of each day.',
      'Heating and lighting must run through long dark periods.',
    ],
    missionImpact: [
      'Energy storage must hold far more.',
      'Heat retention and efficient heating matter more.',
      'Night-time work and scheduling shift to the crew’s advantage.',
    ],
    judgeGuide: 'Does it keep power, heat and food running through double-length nights?',
    metric: { from: 12, value: 24, unit: ' h', label: 'hours of darkness' },
    caption: 'Daily darkness, illustrative.',
    tagDeltas: {
      energy: v(-20, 'Generation stops for much of the day.'),
      shelter: v(20, 'Insulation keeps heat through long nights.'),
      life: v(10, 'Growing and recycling run on stored power.'),
      compute: v(10, 'Scheduling moves work into daylight hours.'),
      mobility: v(-10, 'Vehicles run less in the dark.'),
    },
    overrides: {
      'battery-storage': v(50, 'Stores enough power to cover a double night.'),
      'solar-photovoltaics': v(-50, 'Panels make almost no power through the long night.'),
    },
  },
}

export const TWIST_IDS = Object.keys(TWISTS)

/** Deterministic: the same runId gives the same twist on the server and in the browser. */
export function twistForRun(runId: string): string {
  return TWIST_IDS[hashString(runId) % TWIST_IDS.length]
}

/** The full per-technology table for a twist: exact overrides, else the rounded mean of matching tag deltas, else 0. */
export function valuesFor(twist: Twist): Record<string, TwistValue> {
  const out: Record<string, TwistValue> = {}
  for (const tech of TECHNOLOGIES) {
    const exact = twist.overrides?.[tech.id]
    if (exact) {
      out[tech.id] = exact
      continue
    }
    const hits = tech.tags.map((tag) => twist.tagDeltas[tag]).filter((h): h is TwistValue => h !== undefined)
    if (hits.length === 0) {
      out[tech.id] = { delta: 0, reason: 'Not affected by this twist.' }
      continue
    }
    const delta = Math.round(hits.reduce((sum, h) => sum + h.delta, 0) / hits.length)
    out[tech.id] = { delta: delta || 0, reason: [...new Set(hits.map((h) => h.reason))].join(' ') }
  }
  return out
}

/** Twist strength is drawn per run from its runId: about 25% mild, 50% normal, 25% severe. */
export type TwistStrength = 'mild' | 'normal' | 'severe'
const STRENGTH_MULTIPLIER: Record<TwistStrength, number> = { mild: 0.6, normal: 1, severe: 1.3 }

export function twistStrength(runId: string): TwistStrength {
  const u = seeded(`strength|${runId}`)()
  return u < 0.25 ? 'mild' : u < 0.75 ? 'normal' : 'severe'
}

/** Scales every delta by the strength multiplier, rounds, and keeps it within −50..50. */
export function applyStrength(values: Record<string, TwistValue>, strength: TwistStrength): Record<string, TwistValue> {
  const m = STRENGTH_MULTIPLIER[strength]
  const out: Record<string, TwistValue> = {}
  for (const [id, val] of Object.entries(values)) {
    const scaled = Math.round(val.delta * m) || 0
    out[id] = { delta: Math.min(50, Math.max(-50, scaled)), reason: val.reason }
  }
  return out
}

/** What a run's twist does to each technology, after the run's strength. Use this for display. */
export function valuesForRun(twist: Twist, runId: string): Record<string, TwistValue> {
  return applyStrength(valuesFor(twist), twistStrength(runId))
}

/** Illustrative only: rounded mean delta of the owned technologies, 0 when none have a value. */
export function netShift(twist: Twist, owned: string[], strength: TwistStrength = 'normal'): number {
  const values = applyStrength(valuesFor(twist), strength)
  const deltas = owned.map((id) => values[id]?.delta).filter((d): d is number => d !== undefined)
  if (deltas.length === 0) return 0
  return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length)
}

export const MISSIONS: Record<string, Mission> = {
  'mars-settlement': {
    id: 'mars-settlement',
    title: 'Mars Settlement',
    objective: 'Design a sustainable system that enables a human settlement on Mars.',
    constraints: [
      'Thin, unbreathable atmosphere and average −60 °C temperatures.',
      'Dust storms can block sunlight for weeks.',
      'Communication with Earth is delayed by up to 22 minutes.',
      'Every kilogram launched is expensive, so local resources matter.',
    ],
    success: [
      'People can live there safely for years, not weeks.',
      'Water, energy and air are produced or recycled locally.',
      'The system keeps working when parts fail or storms hit.',
    ],
  },
}

/** Fallback and test fixture only: runs pick their twist with twistForRun(runId). */
export const DEFAULT_TWIST_ID = 'water-crisis'
export const DEFAULT_MISSION_ID = 'mars-settlement'

export const CHARACTERISTICS: { id: Characteristic; label: string; help: string }[] = [
  { id: 'sustainable', label: 'Sustainable', help: 'Runs for years on local or recycled resources without depleting them.' },
  { id: 'scalable', label: 'Scalable', help: 'Grows from a small crew to a larger settlement without redesign.' },
  { id: 'autonomous', label: 'Autonomous', help: 'Operates and recovers without constant human control.' },
  { id: 'adaptable', label: 'Adaptable', help: 'Copes with storms, failures and changing needs.' },
  { id: 'efficient', label: 'Efficient', help: 'Achieves the goal with minimal energy, water and mass.' },
]
