const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');

const configPath = path.join(__dirname, 'config.json');

const questions = [
  {
    type: 'input',
    name: 'discordToken',
    message: 'Discord bot token:',
  },
  {
    type: 'input',
    name: 'telegramToken',
    message: 'Telegram bot token:',
  },
  {
    type: 'input',
    name: 'notificationChannelId',
    message: 'Discord notification channel ID:',
  },
  {
    type: 'input',
    name: 'adminNotificationChannelId',
    message: 'Discord admin notification channel ID:',
  }
];

async function run() {
  const answers = await inquirer.prompt(questions);
  fs.writeFileSync(configPath, JSON.stringify(answers, null, 2));
  console.log(`Configuration saved to ${configPath}`);
}

run();
