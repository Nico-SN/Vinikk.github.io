// **Configuration** – Clé API Steam (remplacer par la vôtre si nécessaire)
const STEAM_API_KEY = "";  // ⚠️ Insérez ici votre clé API Steam

// **Fonction utilitaire** : Construire l'URL de l'API Steam GetPlayerSummaries
function getPlayerSummariesURL(steamId) {
  // Utilise la version v2 de l'API (format=JSON par défaut) pour obtenir nom + avatar
  return `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`;
}

// **Fonction utilitaire** : Construire l'URL de l'API Steam GetOwnedGames
function getOwnedGamesURL(steamId) {
  // Inclut CS2 (AppID 730) dans les jeux retournés, profil doit être public :contentReference[oaicite:12]{index=12}
  return `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&include_played_free_games=1`;
}

// **Fonction utilitaire** : Construire l'URL de l'API publique Leetify
function getLeetifyProfileURL(steamId) {
  return `https://api.leetify.com/api/profile/${steamId}`;
}

// **Fonction principale** : Chargement des données et mise à jour de l'interface
async function loadPlayerStats() {
  const steamId = document.getElementById("steamIdInput").value.trim();
  if (!steamId) {
    alert("Veuillez entrer un SteamID64.");
    return;
  }

  try {
    // 1. Appel API Steam – Récupération nom et avatar
    const profileResp = await fetch(getPlayerSummariesURL(steamId));
    if (!profileResp.ok) {
      throw new Error("Échec de l'appel Steam (GetPlayerSummaries)");
    }
    const profileData = await profileResp.json();
    const player = profileData.response && profileData.response.players[0];
    if (!player) {
      throw new Error("Profil Steam introuvable ou privé.");
    }
    // Extraction du pseudo et de l'URL de l'avatar (taille grand format)
    const playerName = player.personaname;
    const avatarUrl = player.avatarfull;  // URL de l'avatar 184x184 fournie par Steam

    // 2. Appel API Steam – Récupération des heures de jeu CS2 via GetOwnedGames
    let hoursCS2 = 0;
    const gamesResp = await fetch(getOwnedGamesURL(steamId));
    if (gamesResp.ok) {
      const gamesData = await gamesResp.json();
      const games = gamesData.response && gamesData.response.games;
      if (games) {
        // Trouver le jeu CS2 (AppID 730) dans la liste et extraire playtime_forever (min):contentReference[oaicite:13]{index=13}:contentReference[oaicite:14]{index=14}
        const cs2Game = games.find(g => g.appid === 730);
        if (cs2Game) {
          const minutes = cs2Game.playtime_forever || 0;
          hoursCS2 = Math.floor(minutes / 60); // conversion en heures (arrondi à l'entier inférieur)
        }
      }
    }
    // Si l'appel a échoué ou n'a rien retourné, hoursCS2 restera 0.

    // 3. Appel API Leetify – Récupération des stats CS2 (profil Leetify)
    const leetifyResp = await fetch(getLeetifyProfileURL(steamId));
    if (!leetifyResp.ok) {
      throw new Error("Échec de l'appel Leetify (profil non trouvé).");
    }
    const leetifyData = await leetifyResp.json();
    // Extraction des données utiles
    const games = leetifyData.games || [];
    const recentRatings = leetifyData.recentGameRatings || {};

    // Nombre de matchs joués (taille du tableau games)
    const totalMatches = games.length;
    // Calcul du Winrate : (victoires + 0.5*égalités) / total * 100
    let wins = 0, ties = 0;
    games.forEach(game => {
      if (game.matchResult === "win") wins++;
      else if (game.matchResult === "tie") ties++;
    });
    const winRate = totalMatches > 0 ? ((wins + ties * 0.5) / totalMatches * 100).toFixed(1) : 0;
    // Calcul du K/D moyen : total des kills / total des deaths (sur tous les matchs)
    let totalKills = 0, totalDeaths = 0;
    games.forEach(game => {
      if (game.kills !== undefined && game.deaths !== undefined) {
        totalKills += game.kills;
        totalDeaths += game.deaths;
      }
    });
    const kdRatio = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : "N/A";
    // Leetify Rating global (extrait de recentGameRatings)
    const leetifyRating = (recentRatings.leetify !== undefined) ? recentRatings.leetify.toFixed(2) : "N/A";

    // 4. Mise à jour du DOM avec les données récupérées
    // Profil Steam
    document.getElementById("playerName").textContent = playerName;
    document.getElementById("avatar").src = avatarUrl;
    document.getElementById("hoursValue").textContent = hoursCS2;
    // Statistiques globales
    document.getElementById("ratingValue").textContent = leetifyRating;
    document.getElementById("winrateValue").textContent = winRate + " %";
    document.getElementById("kdValue").textContent = kdRatio;
    document.getElementById("matchesCount").textContent = totalMatches;
    // Attribution Leetify – mise à jour du lien vers le profil du joueur sur Leetify
    const leetifyLink = document.getElementById("leetifyLink");
    leetifyLink.href = `https://leetify.com/app/profile/${steamId}`;

    // Remplir la liste des 5 derniers matchs
    const matchesBody = document.getElementById("matchesBody");
    matchesBody.innerHTML = ""; // on vide d'abord tout contenu existant
    if (games.length === 0) {
      // Si aucun match, on affiche une ligne "Aucun match"
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "Aucun match trouvé.";
      row.appendChild(cell);
      matchesBody.appendChild(row);
    } else {
      // Trier les matchs par date de fin décroissante pour prendre les plus récents
      games.sort((a, b) => {
        // On utilise gameFinishedAt (timestamp ISO ou epoch) si disponible, sinon on garde l'ordre
        if (!a.gameFinishedAt || !b.gameFinishedAt) return 0;
        return (a.gameFinishedAt < b.gameFinishedAt) ? 1 : -1;
      });
      const recentGames = games.slice(0, 5);
      recentGames.forEach(game => {
        const row = document.createElement("tr");
        // Colonne Carte
        const mapCell = document.createElement("td");
        mapCell.textContent = game.map || "N/A";
        row.appendChild(mapCell);
        // Colonne Score (format "x:y")
        const scoreCell = document.createElement("td");
        if (game.teamScore !== undefined && game.opponentScore !== undefined) {
          scoreCell.textContent = `${game.teamScore} : ${game.opponentScore}`;
        } else if (game.score) {
          scoreCell.textContent = game.score;
        } else {
          scoreCell.textContent = "-";
        }
        row.appendChild(scoreCell);
        // Colonne Résultat (Victoire/Défaite/Égalité)
        const resultCell = document.createElement("td");
        let resultText = "";
        switch(game.matchResult) {
          case "win": resultText = "Victoire"; break;
          case "loss": resultText = "Défaite"; break;
          case "tie": resultText = "Égalité"; break;
          default: resultText = game.matchResult || "-";
        }
        resultCell.textContent = resultText;
        row.appendChild(resultCell);
        // Colonne K/D (ratio kills/deaths pour le match)
        const kdCell = document.createElement("td");
        if (game.kills !== undefined && game.deaths !== undefined) {
          kdCell.textContent = (game.deaths === 0 ? game.kills : (game.kills / game.deaths).toFixed(2));
        } else {
          kdCell.textContent = "-";
        }
        row.appendChild(kdCell);

        matchesBody.appendChild(row);
      });
    }

    // 5. Afficher la section stats (qui était cachée par défaut)
    document.getElementById("stats").style.display = "block";
  } catch (error) {
    console.error(error);
    alert("Erreur lors du chargement des données : " + error.message);
  }
}

// Mise en place de l'écouteur sur le bouton de chargement
document.getElementById("loadButton").addEventListener("click", loadPlayerStats);
