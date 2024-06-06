console.log('Content script loaded.');

function checkAndMarkGameOnPurchasePage(storageData) {
  console.log('Checking game title...');
  const gameTitleElement = document.querySelector('#appHubAppName');
  if (!gameTitleElement) {
    console.log('Game title element not found.');
    return;
  }

  const gameTitle = gameTitleElement.textContent.trim();
  console.log(`Game title: ${gameTitle}`);
  let bookmarkHTML = '';

  for (const [key, value] of Object.entries(storageData)) {
    let games;
    try {
      games = JSON.parse(value); // Ensure games are parsed as JSON
    } catch (e) {
      console.error(`Error parsing games for user ${key}:`, e);
      continue;
    }

    console.log(gameTitle, games);

    // Ensure games is an array
    if (!Array.isArray(games)) {
      console.error(`Expected games to be an array but got: ${games}`);
      continue;
    }

    if (games.includes(gameTitle)) {
      console.log('here')
      bookmarkHTML += `<span class="game-owner"><img src="chrome-extension://${chrome.runtime.id}/icons/bookmark-solid.svg" alt="Library Icon" style="width: 18px; height: 18px; margin-right: 5px;">${key}</span>`;
    }
  }

  if (bookmarkHTML) {
    const purchaseGameDivs = document.querySelectorAll('.game_area_purchase_game');
    purchaseGameDivs.forEach(div => {
      const h1Element = div.querySelector('h1');
      if (h1Element) {
        const bookmarkElement = document.createElement('div');
        bookmarkElement.innerHTML = bookmarkHTML;
        h1Element.appendChild(bookmarkElement);
      }
    });
  }
}

function markWishlistGames(gameNames, steamUsers) {
  console.log('Entering markWishlistGames function');
  console.log('Game names to compare:', gameNames);

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function checkAndMarkGames() {
    const wishlistRows = document.querySelectorAll('.wishlist_row');
    console.log('Number of wishlist rows found:', wishlistRows.length);

    wishlistRows.forEach(row => {
      const titleElement = row.querySelector('.content .title');
      if (titleElement) {
        const gameName = titleElement.textContent.trim();
        console.log('Checking game:', gameName);
        if (gameNames.includes(gameName)) {
          const platformIcons = row.querySelector('.lower_container .platform_icons');
          if (platformIcons && !platformIcons.querySelector('.checkmark')) {
            const usersWithGame = steamUsers.filter(user => user.games.includes(gameName));
            const userNames = usersWithGame.map(user => user.name).join(', ');

            const checkElement = document.createElement('span');
            checkElement.classList.add('checkmark');
            checkElement.style.marginLeft = '10px'; // Add margin to separate from other icons
            checkElement.style.color = '#66c0f4'; // Change color to match the title
            checkElement.innerHTML = `<img src="chrome-extension://${chrome.runtime.id}/icons/bookmark-solid.svg" alt="Library Icon" style="width: 18px; height: 18px; margin-right: 5px;">${userNames}`;
            platformIcons.appendChild(checkElement);
          }
        }
      }
    });
  }

  let observer;
  const observerCallback = debounce(mutations => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length) {
        checkAndMarkGames();
      }
    });
  }, 300);

  function startObserver() {
    const wishlistContainer = document.querySelector('.wishlist_container_selector');
    if (wishlistContainer) {
      observer = new MutationObserver(observerCallback);
      observer.observe(wishlistContainer, { childList: true, subtree: true });
    }
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
    }
  }

  checkAndMarkGames();
  startObserver();

  window.addEventListener('scroll', debounce(() => {
    stopObserver();
    checkAndMarkGames();
    startObserver();
  }, 500));
}

// Request localStorage data from the background script
chrome.runtime.sendMessage({ action: 'getLocalStorage' }, (response) => {
  console.log('Received localStorage data from extension context', response);

  // Mark games in wishlist
  const gameNames = [];
  const steamUsers = [];
  for (const [key, value] of Object.entries(response)) {
    let games;
    try {
      games = JSON.parse(value); // Ensure games are parsed as JSON
    } catch (e) {
      console.error(`Error parsing games for user ${key}:`, e);
      continue;
    }

    gameNames.push(...games);
    steamUsers.push({ name: key, games: games });
  }

  markWishlistGames(gameNames, steamUsers);

  // Check and mark game on purchase page
  checkAndMarkGameOnPurchasePage(response);
});
