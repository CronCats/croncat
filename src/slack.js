import axios from 'axios'

class Slack {
  constructor(options) {
    this.slackToken = options.slackToken
    return this
  }

  getHookUrl(options) {
    if (!options || !options.slackToken) return
    const id = options.slackToken || this.slackToken
    return `https://hooks.slack.com/services/${id}`
  }

  send(options = {}) {
    const url = this.getHookUrl(options)
    if (!url) return
    const data = {
      channel: options.slackChannel ? `#${options.slackChannel}` : '#general',
      username: 'Croncat',
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
