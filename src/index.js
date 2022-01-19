import * as config from './configuration'
import { bootstrap } from './agent'
import * as tasks from './tasks'
import * as triggers from './triggers'

// Cron Agent Loops
(async () => {
  const isActive = await bootstrap()

  // TODO: Change agent register flow, to be in agent!
  // agent.run()

  // TODO: Move the following into agent?
  if (isActive) tasks.run()
  // TODO: Only run if agent bootstrap reveals agent active
  if (config.BETA_FEATURES && isActive) triggers.run()
})()