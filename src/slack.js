require('dotenv').config()
import axios from 'axios'

class Slack {
  constructor(options) {
    this.slackToken = options.slackToken
    return this
  }

  getHookUrl(options) {
    if (!options || !options.slackToken && !this.slackToken) return
    const id = options.slackToken || this.slackToken
    return `https://hooks.slack.com/services/${id}`
  }

  send(options = {}) {
    const url = this.getHookUrl(options)
    const env_name = process.env.NEAR_ENV || 'testnet'
    const account = process.env.AGENT_ACCOUNT_ID || null
    if (!url) return
    const data = {
      channel: options.slackChannel ? `#${options.slackChannel}` : '#general',
      username: `Croncat${env_name ? ' ' + env_name.toUpperCase() : ''}${account ? ' - ' + account : ''}`,
      // Example: 'Alert! You need to do something! <https://url.com|Click here>'
      text: options.text || 'Croncat Update!',
      icon_url: 'https://cron.cat/icons/icon-512x512.png',
      ...options,
    }
    return axios.post(url, JSON.stringify(data)).then(res => (res), err => {
      console.log('err', err)
    })
  }
}

export default Slack
