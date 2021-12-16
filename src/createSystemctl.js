const path = require("path");
const { writeFileSync } = require("fs");
import chalk from 'chalk'

const generateDaemon = (env = 'testnet', user = 'near') => {
  return `Description=CronCat ${env.toUpperCase()} Agent
After=multi-user.target

[Service]
Type=simple
User=${user}
WorkingDirectory=/home/${user}/croncat/${env}
ExecStart=/usr/bin/croncat go
StandardOutput=append:/var/log/croncat_${env}.log
StandardError=append:/var/log/croncat_${env}error.log
Restart=on-failure
RestartSec=60
KillSignal=SIGINT
TimeoutStopSec=45
KillMode=mixed

[Install]
WantedBy=multi-user.target`
}

export const createDaemonFile = async (env) => {
  const _env = env || process.env.NEAR_ENV || 'testnet'
  const user = require("os").userInfo().username
  const daemon = generateDaemon(_env, user)

  await writeFileSync(path.join(process.cwd(), `croncat_${_env}.service`), daemon)

  // log next steps to user
  const nextSteps = `
For the following steps, you can copy/paste the commands to finish setting up croncat daemon.

# 1. create the service symlink and then enable the service
${chalk.green(' sudo systemctl link ~/croncat/' + _env + '/croncat_' + _env + '.service')}
${chalk.green(' sudo systemctl enable croncat_' + _env + '.service')}

# 2. reload systemctl
${chalk.green(' sudo systemctl daemon-reload')}

# 3. start the service
${chalk.green(' sudo systemctl start croncat_' + _env + '.service')}

# 4. for accessing logs, you can use these commands, just make sure to use the right network name
${chalk.green(' journalctl -f -u croncat_' + _env + '.service')}
${chalk.green(' tail -f /var/log/croncat_' + _env + '.log')}
${chalk.green(' tail -f /var/log/croncat_' + _env + 'error.log')}
`
  console.log(nextSteps)
}

// // NOTE: for testing
// ;(async () => {
//   await createDaemonFile()
// })()