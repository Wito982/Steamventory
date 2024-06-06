chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchGames') {
    const steamIds = message.steamIds;
    const gameNamesSet = new Set();
    const steamUsers = [];

    function fetchGamesForSteamId(steamId, callback) {
      const communityUrl = `https://steamcommunity.com/id/${steamId}/games/?tab=all`;
      console.log(`Opening new tab for URL: ${communityUrl}`);

      chrome.windows.create({ url: communityUrl, type: 'popup', state: 'minimized' }, (window) => {
        const tabId = window.tabs[0].id;
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
          steamUsers.push({ name: steamId, games: games });
          console.log('Game names fetched:', games);

          chrome.windows.remove(window.id, () => {
            console.log(`Window with ID ${window.id} closed.`);
            callback(null);
          });
        });
      });
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
          // Store games in chrome.storage.local of the extension context
          const steamUserData = {};
          steamUsers.forEach(user => {
            steamUserData[user.name] = JSON.stringify(user.games); // Ensure games are stored as JSON strings
          });
          chrome.storage.local.set(steamUserData, () => {
            sendResponse({ gameNames: Array.from(gameNamesSet), steamUsers: steamUsers });

            // Send data to the content script to store in the page's localStorage
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
              if (!tabs || tabs.length === 0) {
                console.error('No active tab found.');
                return;
              }
              chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: saveToLocalStorage,
                args: [steamUserData]
              });
            });
          });
        }
      });
    });

    return true; // Keep the message channel open for sendResponse
  } else if (message.action === 'fetchFamilyMembers') {
    fetchFamilyMembers(sendResponse);
    return true; // Keep the message channel open for sendResponse
  }

  // Handle request for data from chrome.storage.local of the extension context
  if (message.action === 'getLocalStorage') {
    chrome.storage.local.get(null, (data) => {
      sendResponse(data);
    });
    return true; // Keep the message channel open for sendResponse
  }
});

function fetchGamesFromCommunity(steamId) {
  const url = `https://steamcommunity.com/id/${steamId}/games/?tab=all`;
  console.log(`Fetching games from: ${url}`);

  return fetch(url)
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

// This function will be injected into the page to save data to the page's localStorage
function saveToLocalStorage(steamUserData) {
  for (const [user, games] of Object.entries(steamUserData)) {
    localStorage.setItem(user, games); // Store games as JSON strings
  }
}

function fetchFamilyMembers(sendResponse) {
  const familyManagementUrl = 'https://store.steampowered.com/account/familymanagement';

  // Open the tab in a detached window
  chrome.windows.create({ url: familyManagementUrl, type: 'popup', state: 'minimized' }, (window) => {
    const tabId = window.tabs[0].id;

    // Add a delay before trying to extract data
    setTimeout(() => {
      extractDataWithRetries(tabId, window.id, sendResponse);
    }, 500); // Half-second delay to allow the page to load
  });
}

function extractDataWithRetries(tabId, windowId, sendResponse, retries = 5) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: extractFamilyMembers
  }, (results) => {
    if (chrome.runtime.lastError || results[0].result.length === 0) {
      if (retries > 0) {
        console.log('Retrying data extraction...');
        setTimeout(() => {
          extractDataWithRetries(tabId, windowId, sendResponse, retries - 1);
        }, 500); // Retry after half-second
      } else {
        console.error('Failed to fetch family members after multiple attempts');
        sendResponse({ error: 'Failed to fetch family members' });
        chrome.windows.remove(windowId, () => {
          console.log(`Window with ID ${windowId} closed.`);
        });
      }
    } else {
      const familyMembers = results[0].result;
      sendResponse({ familyMembers: familyMembers });

      chrome.windows.remove(windowId, () => {
        console.log(`Window with ID ${windowId} closed.`);
      });
    }
  });
}

function extractFamilyMembers() {
  const familyMembers = [];
  const panels = document.querySelectorAll('.Panel.Focusable a[href*="steamcommunity.com/profiles"], .Panel.Focusable a[href*="steamcommunity.com/id"]');

  panels.forEach((panel, index) => {
    if (index > 0) { // Skip the first element
      const url = panel.href;
      const matches = url.match(/\/(profiles|id)\/([^/]+)/);
      if (matches && matches[2]) {
        familyMembers.push(matches[2]);
      }
    }
  });

  return familyMembers;
}
