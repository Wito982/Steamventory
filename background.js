chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchGames') {
    const steamIds = message.steamIds;
    const gameNamesSet = new Set();
    const steamUsers = [];

    function fetchGamesForSteamId(steamId, callback) {
      // Check if steamId is all digits
      const isNumericId = /^\d+$/.test(steamId);
      const communityUrl = isNumericId ? 
        `https://steamcommunity.com/profiles/${steamId}/games/?tab=all` :
        `https://steamcommunity.com/id/${steamId}/games/?tab=all`;
      
      console.log(`Opening new tab for URL: ${communityUrl}`);

      chrome.tabs.create({ url: communityUrl, active: false }, (tab) => {
        const tabId = tab.id;
        console.log(`New tab created with ID: ${tabId}`);

        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: fetchGamesFromCommunity,
          args: [steamId],
        }, (results) => {
          if (chrome.runtime.lastError) {
            console.error('Error executing script:', chrome.runtime.lastError.message);
            callback(new Error('Failed to fetch games'));
            return;
          }

          const games = results[0].result;
          games.forEach(game => gameNamesSet.add(game));
          if (isNumericId) {
            fetchSteamUserName(steamId, (userName) => {
              steamUsers.push({ name: userName || steamId, games: games });
              console.log(`User name fetched: ${userName}`);
              chrome.tabs.remove(tabId, () => {
                console.log(`Tab with ID ${tabId} closed.`);
                callback(null);
              });
            });
          } else {
            steamUsers.push({ name: steamId, games: games });
            chrome.tabs.remove(tabId, () => {
              console.log(`Tab with ID ${tabId} closed.`);
              callback(null);
            });
          }
        });
      });
    }

    function fetchSteamUserName(steamId, callback) {
      const profileUrl = `https://steamcommunity.com/profiles/${steamId}`;
      console.log(`Opening new tab for profile URL: ${profileUrl}`);

      chrome.tabs.create({ url: profileUrl, active: false }, (tab) => {
        const tabId = tab.id;
        console.log(`New profile tab created with ID: ${tabId}`);

        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: getUserNameFromProfile,
          args: [],
        }, (results) => {
          if (chrome.runtime.lastError) {
            console.error('Error executing script:', chrome.runtime.lastError.message);
            callback(null);
            return;
          }

          const userName = results[0].result;
          console.log(`User name fetched from profile: ${userName}`);

          chrome.tabs.remove(tabId, () => {
            console.log(`Profile tab with ID ${tabId} closed.`);
            callback(userName);
          });
        });
      });
    }

    function getUserNameFromProfile() {
      const nameElement = document.querySelector('.actual_persona_name');
      return nameElement ? nameElement.textContent.trim() : null;
    }

    let completedRequests = 0;
    steamIds.forEach(steamId => {
      fetchGamesForSteamId(steamId, (error) => {
        completedRequests++;
        if (error) {
          sendResponse({ error: error.message });
          return;
        }
        if (completedRequests === steamIds.length) {
          sendResponse({ gameNames: Array.from(gameNamesSet), steamUsers: steamUsers });
        }
      });
    });

    return true; // Keep the message channel open for sendResponse
  }
});

function fetchGamesFromCommunity(steamId) {
  // The URL is determined dynamically in fetchGamesForSteamId
  return fetch(document.URL)
    .then(response => response.text())
    .then(html => {
      console.log('HTML fetched successfully');

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const templateElement = doc.querySelector('#gameslist_config');
      if (!templateElement) {
        throw new Error('Games list config template not found');
      }

      const gamesListData = templateElement.getAttribute('data-profile-gameslist');
      const gamesList = JSON.parse(gamesListData);
      const gameNames = gamesList.rgGames.map(game => game.name);
      console.log('Parsed game names:', gameNames);

      return gameNames;
    })
    .catch(error => {
      console.error('Error fetching the data:', error);
      return [];
    });
}
