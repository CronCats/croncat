import * as config from './configuration'
import * as agent from './agent'
import * as tasks from './tasks'
import * as triggers from './triggers'

// Start agent sub-loops
const runSubLoops = () => {
  // Continuous check for agent status changes
  agent.run()

  // do the things
  tasks.run()
  // do the moar thinsg
  if (config.BETA_FEATURES) triggers.run()
}

// Cron Agent Loops
(async () => {
  // Load up the agent
  const isActive = await agent.bootstrap()

  if (isActive) runSubLoops()
  else {
    // loop and check agent status until its available
    function checkAgent() {
      const active = await agent.checkStatus()
      if (active) runSubLoops()
      else setTimeout(checkAgent, config.WAIT_INTERVAL_MS || 60 * 1000)
    }
    checkAgent()
  }
})()