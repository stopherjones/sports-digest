import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { generateDigestHtml } from './scripts/generate-digest-email.mjs';

const app = express();
const PORT = 3000;

app.get('/api/digest', async (req, res) => {
  try {
    const eventsData = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data.json'), 'utf-8'));
    const teamsData = JSON.parse(await fs.readFile(path.join(process.cwd(), 'teams-data.json'), 'utf-8'));
    const { html } = generateDigestHtml(eventsData, teamsData);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send('Error generating digest email: ' + err.message);
  }
});

app.use(express.static(process.cwd()));

app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
