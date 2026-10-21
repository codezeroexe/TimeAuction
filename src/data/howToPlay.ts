export const RULES_PREVIEW = [
  { title: 'Register', body: 'Enter as an individual or a team and receive ChronoCoins for the auction. The amount depends on the match size.' },
  { title: 'Bid', body: 'Bid for a drawn set of breakthrough technologies in a live auction.' },
  { title: 'Adapt', body: 'Face a Timeline Twist and receive your Future Mission.' },
  { title: 'Engineer', body: 'Select the technologies you acquired and engineer a solution.' },
  { title: 'Compete', body: 'Receive a score and compete on the leaderboard.' },
] as const

export const HOW_TO_PLAY = [
  {
    heading: 'Your budget',
    body: 'Every player or team starts with ChronoCoins set by the match size: 200 CC for each technology up for auction. Coins are your only resource — spend them carefully, because unspent coins do not buy you anything once the auction closes.',
  },
  {
    heading: 'The technology auction',
    body: 'A drawn set of breakthrough technologies goes up for auction one at a time. The highest bid wins each technology and the amount is deducted from the winner’s balance. You can never bid more than you hold.',
  },
  {
    heading: 'The Timeline Twist',
    body: 'After the auction, the timeline shifts. One Timeline Twist is drawn at random for your run, with a random strength, and changes the conditions of the world — some technologies become more valuable, others less so.',
  },
  {
    heading: 'Your Future Mission',
    body: 'You receive a Future Mission: one of humanity’s great challenges. Choose the required number of technologies you acquired and explain how they combine into a solution.',
  },
  {
    heading: 'Scoring and leaderboard',
    body: 'Solutions are scored on how well the chosen technologies fit the mission and the twist. Final scores are ranked on the leaderboard.',
  },
] as const
