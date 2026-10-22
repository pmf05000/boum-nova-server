# BOUM NOVA — Serveur multijoueur 100 % gratuit (Render)

Ne change pas ton hébergement GoDaddy et ne souscris pas à Node.js Hosting.

## Mise en ligne sans utiliser de terminal

1. Crée un compte **GitHub** gratuit sur https://github.com (compte nécessaire pour stocker les fichiers du serveur).
2. Sur https://github.com/new, crée un dépôt **privé** nommé `boum-nova-server` (sans README initial).
3. Décompresse `BOUM_NOVA_SERVEUR_RENDER_GRATUIT.zip` sur ton ordinateur. Dans le dépôt GitHub, clique **uploading an existing file** puis glisse **les fichiers décompressés**, notamment `server.js`, `package.json` et `render.yaml`. IMPORTANT : n'envoie pas le ZIP non décompressé. Valide avec **Commit changes**.
4. Ouvre https://dashboard.render.com et connecte-toi avec GitHub. Clique **New > Blueprint** (ou "New Blueprint Instance") et choisis le dépôt `boum-nova-server`.
5. Render lit `render.yaml`. Vérifie que le plan affiché est bien **Free**, puis valide le déploiement. Refuse toute option payante si proposée. Si Render ne détecte pas `render.yaml`, crée **New > Web Service**, choisis le dépôt, sélectionne **Free**, renseigne `npm install` pour Build Command et `npm start` pour Start Command.
6. Quand le service affiche **Live**, Render fournit une adresse telle que `https://boum-nova-multijoueur.onrender.com`. Ouvre `https://TON-ADRESSE.onrender.com/health` : une réponse contenant `"ok":true` confirme le démarrage.
7. Dans BOUM NOVA sur chacun des téléphones : **Multijoueur en ligne > Adresse du serveur**. Entre `wss://TON-ADRESSE.onrender.com/ws` (remplace TON-ADRESSE par l'adresse exacte de Render).
8. Un joueur clique **CRÉER UN SALON**, donne son code aux amis. Les autres cliquent **REJOINDRE** avec le code. L'hôte clique **LANCER LA PARTIE**.

## Important

- Render gratuit se met en veille après 15 minutes sans requête HTTP ni message WebSocket entrant. Le réveil prend parfois environ une minute : recommence la création du salon si nécessaire.
- Le serveur est un prototype destiné aux tests et petites parties entre amis, pas un service garanti disponible 24 h/24.
- Le jeu fonctionne avec 1 à 4 vrais joueurs ; toutes les places libres sont confiées à des IA.
- Les salons en cours disparaissent lorsque le service redémarre ou se met en veille.
- Pas de carte bancaire nécessaire pour rester sur le plan Free, tant que tu ne choisis pas d'option payante. Ne connecte pas de moyen de paiement si tu veux éviter tout prélèvement.
- La plateforme et les règles du service peuvent changer. Vérifie les conditions au moment de déployer.
- Ce serveur n'a PAS été mis en ligne à ta place. Seul le compte Render choisi peut réaliser le déploiement.

Documentation officielle : https://render.com/docs/free et https://render.com/docs/websocket
