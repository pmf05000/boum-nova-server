# BOUM NOVA — Serveur gratuit Render

**Commence par le fichier `GUIDE_SIMPLE_RENDER.md`.**

Ce serveur Node.js n'exige pas GoDaddy, ni Firebase, ni base de données.
Il écoute le port donné par la variable d'environnement `PORT` (compatible Render).
Le chemin WebSocket est `/ws`, et `/health` permet de tester le service.

Développement local : `npm install` puis `npm test` et `npm start`.
