import * as config from './configuration'
import * as agent from './agent'
import * as tasks from './tasks'
import * as triggers from './triggers'
import * as util from './util'

// Start agent sub-loops
export const runSubLoops = async () => {
  // Continuous check for agent status changes
  agent.run()

  // do the things
  tasks.run()

  // do the moar thinsg
  if (config.BETA_FEATURES) triggers.run()
}

export const runMainLoop = async () => {
  // Load up the agent
  const isActive = await agent.bootstrap()

  // Setup heartbeat monitor if configured
  if (config.HEARTBEAT) {
    // loop and check agent status until its available
    async function heartbeatPing() {
      await util.pingHeartbeat()
      setTimeout(heartbeatPing, config.WAIT_INTERVAL_MS * 2)
    }
    heartbeatPing()
  }

  if (isActive) runSubLoops()
  else {
    // loop and check agent status until its available
    async function checkAgent() {
      const active = await agent.checkStatus()
      util.dbug('checkAgent is active', active)
      if (active) runSubLoops()
      else setTimeout(checkAgent, config.WAIT_INTERVAL_MS || 60 * 1000)
    }
    checkAgent()
  }
}