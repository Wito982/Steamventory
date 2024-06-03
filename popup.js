document.addEventListener('DOMContentLoaded', () => {
    const fetchGamesButton = document.getElementById('fetchGamesButton');
  
    // Load translations
    fetch('languages/translations.json')
      .then(response => response.json())
      .then(translations => {
        const userLang = localStorage.getItem('language') || 'en';
        applyTranslations(translations, userLang);
        
        document.querySelectorAll('.flag-icon').forEach(flag => {
          flag.addEventListener('click', () => {
            const lang = flag.getAttribute('data-lang');
            localStorage.setItem('language', lang);
            applyTranslations(translations, lang);
          });
        });
      });
  
    // Function to apply translations
    function applyTranslations(translations, lang) {
      document.getElementById('description').innerHTML = translations[lang].description + 
        ' <img src="icons/bookmark-solid.svg" alt="Bookmark Icon" style="width: 18px; height: 18px; vertical-align: middle;">';
      document.getElementById('steamIdInput').placeholder = translations[lang].placeholder;
      fetchGamesButton.textContent = translations[lang].fetchButton;
      document.getElementById('footer-github').innerHTML = translations[lang].footer.github + 
        ' <a href="https://ko-fi.com/wito982" target="_blank">Ko-fi</a>.';
        const footerPoweredBy = document.getElementById('footer-poweredBy');
        footerPoweredBy.innerHTML = translations[lang].footer.poweredBy + 
            ' <a href="https://github.com/Wito982/Steamventory/" target="_blank"><img class="fab fa-github" style="width: 14px;" src="icons/github.svg" ></a>';
    }
  
    if (fetchGamesButton) {
      fetchGamesButton.addEventListener('click', () => {
        console.log('Button clicked');
        const steamIdsInput = document.getElementById('steamIdInput').value;
  
        if (!steamIdsInput) {
          console.error('Steam IDs are required');
          return;
        }
  
        const steamIds = steamIdsInput.split(' ').map(id => id.trim()).filter(id => id);
  
        chrome.runtime.sendMessage({ action: 'fetchGames', steamIds: steamIds }, response => {
          if (response.error) {
            console.error('Error response:', response.error);
            return;
          }
  
          const gameNames = response.gameNames;
          const steamUsers = response.steamUsers;
          console.log('Received game names:', gameNames);
  
          const gameListElement = document.getElementById('gameList');
          gameListElement.innerHTML = ''; // Clear previous results
  
          gameNames.forEach(game => {
            const listItem = document.createElement('li');
            listItem.textContent = game;
            gameListElement.appendChild(listItem);
          });
  
          // Inyectar el script en la página actual
          chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: markWishlistGames,
              args: [gameNames, steamUsers]
            });
          });
        });
      });
    } else {
      console.error('Button fetchGamesButton not found');
    }
  });
  
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
  