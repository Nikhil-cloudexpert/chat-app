# Real-Time Chat App Deployment Guide (Azure VM Ubuntu 22.04 LTS)

## Prerequisites
1. Connect via SSH: `ssh username@your-vm-ip`
2. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
3. Install MongoDB (if choosing local Community Edition):
   ```bash
   sudo apt-get install gnupg curl
   curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
   echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
   sudo apt-get update
   sudo apt-get install -y mongodb-org
   sudo systemctl start mongod
   sudo systemctl enable mongod
   ```
   **Important:** MongoDB is bound to `127.0.0.1:27017` by default in `/etc/mongod.conf`. Leave this as is to prevent public access.

4. Install PM2:
   ```bash
   sudo npm install pm2@latest -g
   ```

## Deployment Steps
1. Clone or copy your project files to the VM (e.g., `/home/username/chat-app`).
2. Navigate to the project directory:
   ```bash
   cd /home/username/chat-app
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Update `ecosystem.config.js` inside the project with your production secret.
5. Start app via PM2:
   ```bash
   pm2 start ecosystem.config.js --env production
   ```
6. Set PM2 to auto-start on reboot:
   ```bash
   pm2 startup
   pm2 save
   ```

## Managing Application
- Check Status: `pm2 status`
- Monitor logs: `pm2 monit` or `pm2 logs chat-app`
- Restart server: `pm2 restart chat-app`

## Allowing Web Traffic
In the Azure Portal, go to your Virtual Machine's **Networking** section. Add an Inbound Security Rule:
- Destination Port Ranges: `3000`
- Protocol: `TCP`
- Action: `Allow`
- Name: `Allow-Port-3000`

Your app will now be accessible at `http://<your-vm-ip>:3000/`.
