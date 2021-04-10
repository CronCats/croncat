import * as actions from './actions'

// Cron Agent Task Loop
(async () => {
  await actions.bootstrapAgent()

  // MAIN AGENT LOOP
  actions.runAgentTick()
})()