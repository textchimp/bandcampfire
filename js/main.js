/*

  random play error on mobile:
  "Unhandled Promise Rejection: NotAllowedError: The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission." 
  Line 220: randPlayer.play();
  "You might encounter the error when there is an async operation between the user interaction and playing of audio." i.e. DOESN'T work for "expand new" random when a fetch() is involved

  Shortcuts:
    - 's'  (while playing) save artist to faves
    - shift + click (on song) open in new tab


  TODO:

  - toggle for 'play only expanded' vs 'all'

  - hide recs that have already appeared too often in tree?

  - skip random play of "recently played" tracks (slider to control) ... LS play history reqd

  - highlight bands also in Saved list

  - add 'treeState' LS to remember tree open/collapsed view on load

    - use tree to do 'random follow' 0-100% i.e. how often to randomly open a node and play one of the children (currently works using click() and dat.gui)
    - control var for 'max tree depth' when randomly expanding tree

  - decide how to handle albums tracks in random/next play context (toggles for including in random or not?) ---- Not an issue if album tracks re-use parent rec player? i.e. not included by default... but how to include if wanted?

  - layout shrink to smaller thumbnail and single-row label + player when UI gets too long vertically? i.e. 'compact mode'  ... length of band names an issues for consistent width of row?
  - mobile mode with larger play controls

  - replace default audio player widget for more layout customisation

  - mobile touch/hold interactions?

// https://essential-audio-player.net/
*/
const params = new URLSearchParams(window.location.search);
const startUrl = params.get('url') ?? 'https://bmblackmidi.bandcamp.com/album/hellfire';

const FORCE_RELOAD = params.get('nocache') !== null || false;  // reload ALL
const APP_VERSION = '0.2.1';  // Change this to force reload of cached LocalStorage page data (per cached-band-obj)

// const cors = 'http://localhost:9999/';
const cors = 'https://corsproxy.io/?';

// helpers
// Object.prototype.l = function (x) {console.log('log:', this); return this; };
const l = console.log;
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

let baseElement = null;
let currentlyPlayingNode = null;
let lastPlayingNode = null;

let savedArtists = loadSavedArtists();
// console.log( `saved artists:`, Object.keys(savedArtists).join(', ') );

const songTree = { [startUrl]: { children: {}, status: null } };
let currentSongTreeNode = songTree[startUrl];


let controlsGui = null;
const controls = {
  randomAdvance: true,
  randomExpandNewProb: 1.0,
};




// Mobile swipe handler code
// from https://stackoverflow.com/a/62825217

const heading = $('header');

heading.addEventListener('touchstart', function (event) {
  touchstartX = event.changedTouches[0].screenX;
  touchstartY = event.changedTouches[0].screenY;
  event.preventDefault(); // no scrolling
}, false);

heading.addEventListener('touchend', function (event) {
  touchendX = event.changedTouches[0].screenX;
  touchendY = event.changedTouches[0].screenY;
  handleGesture(event);
}, false);


function handleGesture(ev) {

  const SWIPE_DISTANCE_THRESHOLD = window.innerWidth * 0.175;

  const passedThreshold = Math.abs(touchendX - touchstartX) > SWIPE_DISTANCE_THRESHOLD;

  if( !passedThreshold ) return;

  if (touchendX < touchstartX) {
    // alert('Swiped Left');
  }

  if (touchendX > touchstartX) {
    // alert('Swiped Right');
    advanceTrack({ target: currentlyPlayingNode }); // actually to get random order
  }


  // These need fine-tuning to work well, i.e vert swipe must be N times larger than horiz, or vice versa

  // if (touchendY < touchstartY) {
  //   alert('Swiped Up');
  // }

  // if (touchendY > touchstartY) {
  //   alert('Swiped Down');
  // }

  // if (touchendY === touchstartY) {
  //   console.log('Tap');
  // }

} // handleGesture()

// swipe


// https://bobbyhadz.com/blog/javascript-wait-for-element-to-exist

function waitForElementToExistAt(selector, node) {
  return new Promise(resolve => {
    if (node.querySelector(selector)) {
      return resolve(node.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (node.querySelector(selector)) {
        resolve(node.querySelector(selector));
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
    });
  });
}


function trunc(str, len=25){
  return str.length < len ? str : str.substring(0, len) + '…';  
}

function audioPauseHandler(e){
  console.log(`audioPauseHandler()`);
  e.target.closest('.player').classList.remove('playing');
  $('header img').style.display = 'none';
}

 function audioPlayHandler({target}) {
  console.log( `audioPlayHandler()` );
  currentlyPlayingNode = target;
  $$('audio').forEach(el => el !== target && el.pause());
  console.log( `new play level:`, target.dataset.nestingLevel );

  // TODO: Remove deeper levels breadcrumb  when newest playing is from a higher level
  let playTitleNode = document.querySelector(`#mainTitle .playing[data-nesting-level="${target.dataset.nestingLevel}"]`);
  if( !playTitleNode ){
    playTitleNode = document.createElement('span');
    playTitleNode.className = 'playing';
    playTitleNode.dataset.nestingLevel = target.dataset.nestingLevel;
    document.querySelector('#mainTitle').appendChild(playTitleNode);
  } 
  playTitleNode.innerHTML = `<span>&gt;</span>${target.dataset.artist}`;   

  target.closest('.player').classList.add('playing');

  const headerImg = $('header img');
  console.log( `playing node:`, currentlyPlayingNode );
  headerImg.src = currentlyPlayingNode.dataset.image;
  headerImg.style.display = 'inline';
} //audioPlayHandler()

function advanceTrack(ev, randomOrder=false){
  // actually 'ended' event handler

  ev?.target?.closest('.player').classList.remove('playing');

  const players = $$('audio');
  if( controls.randomAdvance || randomOrder ){

    if( Math.random() < controls.randomExpandNewProb ){
      quickNastyRandomExpand();
    } else {
      // Normal random
      let randomPlayer = ev.target; // guarantee 1 try below
      while( randomPlayer === ev.target ){
        randomPlayer = players[Math.floor(players.length * Math.random())];
      }
      randomPlayer.play();
      randomPlayer.scrollIntoView({ behavior: "smooth", inline: "nearest" });

    }

  } else {
    // const justEnded = $$( 'audio' ).findIndex;
  }
} // advanceTrack()

async function quickNastyRandomExpand(){

  const unopened = $$('.opener[data-loaded="false"]');
  const randy = unopened[Math.floor(Math.random() * unopened.length)]
  randy.scrollIntoView({ behavior: "smooth", inline: "nearest" });
  randy.click();

  const childRecs = randy.parentElement.nextElementSibling;
  await waitForElementToExistAt('.player', childRecs);

  const players = childRecs.querySelectorAll('audio');
  const randPlayer = players[Math.floor(Math.random() * players.length)];
  randPlayer.play();
  randPlayer.scrollIntoView({ behavior: "smooth", inline: "nearest" });

}

function userAdvanceTrack(){
  const players = [...$$('audio')];
  const playingIndex = players.findIndex(a => a.duration > 0 && !a.paused);
  console.log(`found`, playingIndex);
  let nextIndex = playingIndex + 1;
  if (nextIndex > players.length - 1) {
    nextIndex = 0;
  }
  console.log(`playing`, playingIndex, nextIndex);
  players[nextIndex].play();
}

function playToggle(audio){
  audio.paused ? audio.play() : audio.pause();
}

  function playOrOpen(ev, audio) {
  if (ev.shiftKey) {
    window.open(audio.dataset.url, '_blank');
    ev.preventDefault();
  } else {
    playToggle(audio);
  }
}


async function loadRecPlayers(url, parent) {

  let isBase = false;
  if( baseElement === null ){
    baseElement = parent; // remember
    isBase = true;
  } else {
    // const loading = document.createElement('div');
    // loading.className = 'loading';
    // loading.style.marginBottom = '10px';
    // loading.innerHTML = 'Loading...';
    // parent.appendChild(loading);
  }

  let data = null;
  try {
    const stored = localStorage.getItem(url);
    if (stored === null) throw new Error('Not found');
    data = JSON.parse( stored ); 

    console.log( `%cPage data loaded from LS cache`, 'color:green' );

    // Force reload of cached LocalStorage data whenever version changes
    if ( FORCE_RELOAD || data.__version !== APP_VERSION) throw new Error('Old version, refetch');
  
  } catch( err ){
    console.warn('LS cache load issue for: ', url, err.message);
    data = await  parsePage( url ); // Load actual live data from Bandcamp
    console.log(`%cPage data RE-FETCHED`, 'color:green' );
    if(!data){
      $('#mainTitle').innerHTML = `<span style="color: orange">Could not load URL ("${ url }")</span>`;
      return false;
    }
    // console.log( 'data', data );
    data.__version = APP_VERSION; 
    localStore( url, data );
  }

  const { artistName, tagsText, recs, albumTracks } = data;

  // if( !artistName ) debugger;

  let nestingLevel = 0;

  if( isBase ){
    $('#mainTitle').innerHTML = `<span>${trunc(artistName)}</span>`;
  } else {
    // nested
    parent.firstElementChild.remove(); // loading message
    // parent.style.display = 'block'; // unhide
    console.log( `parent`, parent );

    // Album player
    const parentPlayer = parent.parentElement.querySelector('audio'); 
    parent.appendChild( renderAlbumPlayer(albumTracks, parentPlayer) );
    
    // Tags list
    parent.appendChild( renderTags(tagsText) );

    nestingLevel = parseInt(parent.dataset.nestingLevel); 
  }

  let playersNode = document.createElement('div');
  playersNode.className = 'players';
  playersNode.innerHTML += recs.map( r => recPlayerTemplate(r, nestingLevel) ).join('');
  parent.appendChild(playersNode);

  attachAudioHandlers(parent);

  // Update tree
  recs.forEach( r => {
    currentSongTreeNode.children[ r.albumUrl ] = { children: {}, status: null };
  });

} // loadRecPlayers()

function renderTags( tagsList ){
  const tags = document.createElement('div');
  tags.className = 'tags';
  const tagsTextStr = tagsList.join(', ');
  tags.innerHTML = 'Tags: ' + trunc(tagsTextStr, 50);
  if (tagsTextStr.length >= 50) {
    tags.title = tagsTextStr;
  }
  return tags;
} // renderTags()

function renderAlbumPlayer( tracks, parentAudioNode ){
  const player = document.createElement('div');
  player.className = 'albumPlayer';
  let currentIndex = -1;
  let totalTracks = tracks.length;
  player.innerHTML = `<div><a href="${parentAudioNode.dataset.url}" target="_new" title="Open in new tab">Album:</a> <span>1/${totalTracks}. ${tracks[0].title}</span></div>`;
  player.addEventListener('click', e => {
    currentIndex = (currentIndex + 1) % totalTracks;    
    player.innerHTML = `<div><a href="${parentAudioNode.dataset.url}" target="_new" title="Open in new tab">Album:</a> <span>${currentIndex + 1}/${totalTracks}. ${tracks[currentIndex].title}</span></div>`;
   
    parentAudioNode.firstElementChild.src = tracks[currentIndex].audio;
    parentAudioNode.load();
    parentAudioNode.play();
    player.dataset.playing = true;
  });

  return player;
} // renderAlbumPlayer()

async function parsePage(url){

  const urlEnc = encodeURIComponent(url);
  
  let data = null;

  try {
    data = await (await fetch(cors + urlEnc)).text();
    // console.log( 'got', url, data );
  } catch (error) {
    console.log( `Bad URL?`, url );
    return null;    
  }

  
  // console.log( `html`, data );

  // console.time('DOM parse')
  
  // Parse as DOM structure to prevent regular breaking of these
  // extremely fragile regex/splits
  const parser = new DOMParser();
  const pageDom = parser.parseFromString(data, 'text/html');

  let recs, tagsText, artistName;
  const pageBlob = pageDom.querySelector('script[data-pagedata-blob]');

  // WHY?! Why are pages either "blobs + no HTML" or "no blobs + HTML" ????
  // What am I missing?
  if( pageBlob ){

    console.log( `Page: JSON BLOB mode` );

    const pageMeta = JSON.parse(pageBlob.dataset.pagedataBlob);
    // console.log(`pageMeta`, pageMeta);

    const recData = pageMeta.recommendations_footer.album_recs;
    const getArtUrl = (id, size = '6') => `https://f4.bcbits.com/img/a${id.toString().padStart(10, '0')}_${size}.jpg`; // '_1.jpg' gives large size! 5 is good too, not too big; 6 is smallest thumbnail
    // console.log(`art`, recData);
    console.log(`recs BLOB`, pageMeta.recommendations_footer.album_recs[0] );

    recs = pageMeta.recommendations_footer.album_recs.map(r => ({
      audio: r.audio_url,
      album: r.album_title,
      img: getArtUrl(r.art_id), // TODO: save as id, construct URL on render
      albumUrl: r.href, //.split('?')[0], // skip referer ID param
      bandId: r.band_id,
      albumId: r.album_id,
      artist: r.band_name,
    }));

    console.assert(recs.some(r => r !== null), 'recs parse FAILED');


    // Tags requires us to parse this script JSON just for 'keywords'!
    // MISSING for some pages, as above
    const albumHeaderStr = pageDom.querySelector('script#tralbum-jsonld');
    const albumHeader = JSON.parse(albumHeaderStr.innerHTML);
    tagsText = albumHeader.keywords
    // console.log(`tags (JSON blob)`, tagsText);

    artistName = pageDom.querySelector('div.band-info > div.name')?.innerHTML;

    // pageBlob is found
  } else {

    // INSTEAD: recs HTML is found, no JSON blobs
    console.log(`Page: HTML tags mode`);


    const recsNodes = pageDom.querySelectorAll('li.recommended-album');
    recs = [...recsNodes].map( r => ({
      audio: r.dataset.audiourl.split('mp3-128":')[1].split('"')[1],
      album: r.dataset.albumtitle,
      img: r.firstElementChild.firstElementChild.src, // TODO: save as id, construct URL on render;
      albumUrl: r.querySelector('a.album-link').href,
      albumId: r.dataset.albumid,
      artistId: r.dataset.artistid,
      artist: r.dataset.artist,
    }));

    const tagNodes = pageDom.querySelectorAll('a.tag');
    // console.log( `tags`, tagNodes );
    tagsText = [...tagNodes].map( t => t.innerHTML );

    
    artistName = pageDom.querySelector('p#band-name-location > span.title')?.innerHTML;
    // console.log( `artistName`, artistName );

  } // no JSON blobs 
  


  // Album track info
  const album = pageDom.querySelector('script[data-tralbum]');
  const albumData = JSON.parse(album.dataset.tralbum);
  // console.log(`albuminfo`, albumData);

  const albumTracks = albumData.trackinfo
    .filter( t => t.file !== null )
    .map( t => ({
      audio: t.file['mp3-128'], 
      title: t.title, 
      url: t.title_link, 
      id: t.id
    }) );
  // console.log( `album`, albumData, albumTracks );


// console.timeEnd('DOM parse');
console.log('OBJ', { artistName, tagsText, recs, albumTracks } );

return { artistName, tagsText, recs, albumTracks };  

} // parsePage()

// async function OLDparsePageOLD(url){

//   const urlEnc = encodeURIComponent(url);
  
//   let data = null;

//   try {
//     data = await (await fetch(cors + urlEnc)).text();
//     // console.log( 'got', url, data );
//   } catch (error) {
//     console.log( `Bad URL?`, url );
//     return null;    
//   }

//   const recParts = data.split('class="recommended-album footer');

//   // const albumJSON = recParts[0].split('data-tralbum="')[1].split('" data')[0];
//   // const albumJSON = recParts[0].split('data-tralbum="')[1].split(/(" data )|(")/)[0];
//   console.log( `recParts[0]`, recParts[0] );
//   const albumJSON = recParts[0].split('data-tralbum="')[1].split('"')[0];
//   console.log(`albumJSON`, albumJSON);
//   const albumData = JSON.parse(albumJSON.replaceAll('&quot;', '"') ?? '');
//   console.log( `albumData`, albumData );
//   // const albumTracks = albumData.trackinfo.map(t => t.file['mp3-128']);
//   const albumTracks = albumData.trackinfo
//     .filter( t => t.file !== null )
//     .map( t => ({
//       audio: t.file['mp3-128'], 
//       title: t.title, 
//       url: t.title_link, 
//       id: t.track_id
//     }) );

//   console.log( `album`, albumData, albumTracks );

//   const tags = data.split('a class="tag"');
//   const tagsText = tags.slice(1).map(t => t.split('   >')[1].split('</a>')[0]);

// // So funky
// const artistName = data.split('id="name-section"')[1].split('href=')[1].split('>')[1].split('</a')[0];

// // NASTY but beats parsing the HTML?
// // Multiline formatting via: https://stackoverflow.com/a/34755045
// // const regex = /data-audiourl="(?<audio>.*?)".*data-albumtitle="(?<album>.*?)".*data-artist="(?<artist>.*?)".*img class="album-art" src="(?<img>.*?)".*a class="album-link" href="(?<albumUrl>.*?)"(.*span class="comment-contents"\>(?<comment>.*?)\<\/span)?/ms;
// const regex = new RegExp([
//   /data-audiourl="(?<audio>.*?)".*/,
//   /data-albumtitle="(?<album>.*?)".*/,
//   /data-artist="(?<artist>.*?)".*/,
//   /img class="album-art" src="(?<img>.*?)".*/,
//   /a class="album-link" href="(?<albumUrl>.*?)(\?|").*/, // note literal ? to ignore querystring for album URL
//   /(.*span class="comment-contents"\>(?<comment>.*?)\<\/span)?/,
// ].map(r => r.source).join(''), 's');

// const recs = recParts.slice(1).map(r => regex.exec(r)?.groups);
// console.assert(recs.some(r => r !== null), 'REGEX FAILED');

// return { artistName, tagsText, recs, albumTracks };  

// } // parsePage()

function localStore(url, data) {
  try {
    localStorage.setItem(url, JSON.stringify(data));
  } catch (e) {
    console.warn('Error saving cached data for', url, data, err);
  }
}

function recPlayerTemplate(match, level) {
  // console.log( `recPlayerTemplate:`, match );
  //   <source src=${match.audio.split('mp3-128&quot;:')[1].split('&quot;')[1]}>

  return `
  <div class="playerWrapper">
  
    <div class="thumb">
      <img src="${match.img}" title="">
    </div>

    <div class="player">
      <label class="artist">${trunc(match.artist)}</label>
      <audio controls 
        data-url="${match.albumUrl}" 
        data-artist="${match.artist}"
        data-image="${match.img}" 
        data-nesting-level="${level}"
      >
        <source src=${ match.audio }>
      </audio>
    </div>
    
    <div class="follow">
      <span class="opener" data-loaded="false">⤵︎</span>
    </div>
    
    <div class="children"
      data-url="${match.albumUrl}" 
      data-loaded="false"
      data-nesting-level="${level + 1}"
    >
        <div class="loading">Loading...</div>
    </div>

  </div><!-- playerWrapper --> 
  `;
}

function attachAudioHandlers(to){
  to.querySelectorAll('audio').forEach(a => {
    a.addEventListener('play', audioPlayHandler);
    a.addEventListener('ended', advanceTrack);
    a.addEventListener('pause', audioPauseHandler);
  }); // each audio
} // attachAudioHandlers()

function initHandlers() {

  // Using event delegation so these only need to be attached once on load
  // (Audio event handlers don't bubble and thus are added to each 
  // element after creation in loadRecPlayers())

  document.addEventListener('click', async e => {
    const {target} = e;
    
    // Click thumbnail or band name to toggle play
    if( target.parentNode.className === 'thumb'){
      return playOrOpen(e, target.parentNode.parentNode.querySelector('audio') );
    } 
    if( target.className === 'artist' ){
      return playOrOpen(e, target.nextElementSibling);
    } 
    

    // Open button for following rec band (nesting)
    if (target.className === 'opener') {
      const childrenNode = target.parentNode.nextElementSibling;
      if (!childrenNode.classList.contains('opened') ){

        target.innerHTML = '⤴︎';
        target.style.writingMode = 'sideways-lr';
        target.style.color = 'lightblue';
        console.log(`CLICK`, target, 'children:', childrenNode);
        childrenNode.classList.add('opened');

        console.log(`LOADED:`, childrenNode.dataset.loaded );
        if (childrenNode.dataset.loaded === 'false') {
          // Only load once
          await loadRecPlayers(childrenNode.dataset.url, childrenNode);
          childrenNode.dataset.loaded = 'true'; // TODO: neater?
        }
      
      } else {
        // collapse
        target.innerHTML = '⤵︎';
        target.style.writingMode = '';
        target.dataset.loaded = 'false';
        childrenNode.classList.remove('opened');
        // childrenNode.style.display = 'none'; // hide
      }
    } // child open/follow click

  }); // click

  // shift+Hover thumbnail to zoom?
  document.addEventListener('mousemove', e => {
    if( e.target.parentNode.className === 'thumb' && e.shiftKey ){
      e.target.style.width = '40vw';
      e.target.style.height = '40vw';
      e.target.style.position = 'absolute';
    }
  });
  document.addEventListener('mouseout', e => {
    // console.log(`me`, e.shiftKey);
    if( e.target.parentNode.className === 'thumb' ){
      e.target.style.width = '50px';
      e.target.style.height = '50px';
      e.target.style.position = 'static';
    }
  });

  document.addEventListener('keydown', e => {
    console.log(`key`, e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      if (currentlyPlayingNode) {
        currentlyPlayingNode.pause();
        lastPlayingNode = currentlyPlayingNode;
        currentlyPlayingNode = null;
      } else {
        if (lastPlayingNode) {
          lastPlayingNode.play();
          currentlyPlayingNode = lastPlayingNode;
          return;
        }
        // $$('audio')?.play();
        const players = $$('audio');
        const rand = players[Math.floor(players.length * Math.random())];
        rand.play();
        currentlyPlayingNode = rand;
      }
    } else if (e.code === 'ArrowRight') {
      console.log(`Right`);
      e.preventDefault();
    } else if (e.code == 'BracketRight') {
      userAdvanceTrack();
    } else if (e.code == 'Period') {
      advanceTrack({ target: currentlyPlayingNode }); // actually to get random order
    } else if (e.code == 'Slash') {
      // console.log( `Jump 33% current track` );
      currentlyPlayingNode.currentTime += (currentlyPlayingNode.duration / 4.0);
    } else if (e.code == 'KeyS') {
      console.log( `SAVE CURRENT!`, currentlyPlayingNode.dataset );
      if (currentlyPlayingNode ){
        saveArtist( currentlyPlayingNode.dataset );
      }

      e.preventDefault();
    }
  });


  navigator.mediaSession.setActionHandler('nexttrack', function (ev) {
    //  Note: not received if browser not currently playing (FF MacOS)
    console.log(`MEDIA NEXT`, ev);
    userAdvanceTrack();
  });

  window.addEventListener("paste", (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData("text");
    if(pasted.startsWith('http') && pasted.includes('bandcamp.com')){
      window.location = `?url=${pasted}`;
    }
  });

} // initHandlers()

// Start the process 

async function init() {
  // if( !loadBodyFromCache(startUrl) ){
    await loadRecPlayers(startUrl, document.querySelector('#players'), songTree[startUrl]);
  // }
  initHandlers();
  renderSavedArtists(savedArtists);

  controlsGui = new dat.GUI(); //({ closed: true });
  const randomFolder = controlsGui.addFolder('Random');
  randomFolder.add(controls, 'randomAdvance').name('Random Next');
  randomFolder.add(controls, 'randomExpandNewProb', 0.0, 1.0).name('Expand Prob.');
  randomFolder.open();

  controlsGui.close();
  // controlsGui.hide();
};

function renderSavedArtists( artists, parent='#savedArtists'){
   // TODO: display in order-added
    if(Object.keys(artists).length === 0 ) return;
    

   const list = document.createElement('span');
   list.className = 'savedList';
   let i = 0;
   const maxIndex = Object.keys(artists).length - 1;
   for( const key in artists ){
     const title = key.length > 25 ? key : '';
     const comma =  i < maxIndex ? '<span class="comma">, </span>' : ''; 
     list.innerHTML += `<span><a title="${ title }" href="?url=${artists[key]}">${ trunc(key, 25) }</a>${ comma }</span>`;  
     i++;
   }
   $(parent).querySelector('.savedList').replaceWith(list);
} // renderSavedArtists()


function loadSavedArtists(){
  const defaultSavedTesting = { 
  "L I T H I C S": "https: //lithics.bandcamp.com/album/tower-of-age", "Sweeping Promises": "https://sweepingpromises.bandcamp.com/album/hunger-for-a-way-out", "Black Country, New Road": "https://blackcountrynewroad.bandcamp.com/album/for-the-first-time", "black midi": "https://bmblackmidi.bandcamp.com/album/cavalcade", "METZ": "https://metz.bandcamp.com/album/atlas-vending", "Greys": "https://greys.bandcamp.com/album/warm-shadow", "Floatie": "https://floatiehq.bandcamp.com/album/voyage-out", "Sarah Davachi": "https://sarahdavachi.bandcamp.com/album/cantus-descant", "SVIN & Århus Sinfonietta": "https://svin.bandcamp.com/album/elegi", "Les Filles de Illighadad": "https://lesfillesdeillighadad.bandcamp.com/album/eghass-malan", "Michael Gordon & Cello Octet Amsterdam": "https://michaelgordonmusic.bandcamp.com/album/8", "Julia Wolfe": "https://juliawolfemusic.bandcamp.com/album/oxygen", "Hidden Orchestra": "https://hiddenorchestra.bandcamp.com/album/to-dream-is-to-forget", "Hammered Hulls": "https://hammeredhulls.bandcamp.com/album/careening", "Swan Wash": "https://swanwash.bandcamp.com/album/swan-wash" 
  };
  try {
    // return {};
    // return JSON.parse(localStorage.getItem('saved'));
    const savedJson = localStorage.getItem('saved');
    if( !savedJson ){
      return defaultSavedTesting;
    }
    return JSON.parse(savedJson);
  } catch( err ){
    console.warn( `Could not load saved artists`, err );
    // return {};
    return defaultSavedTesting;
  }
} // loadSavedArtists()

function saveArtist( obj ) {
  console.assert( 'artist' in obj, 'saveBand:: artist key missing');
  console.assert( 'url' in obj, 'saveBand:: url key missing');
  try {
    const savedJSON = localStorage.getItem('saved');
    const saved = savedJSON ? JSON.parse(savedJSON) : {};
    saved[ obj.artist ] = obj.url;
    localStorage.setItem('saved', JSON.stringify(saved));
    savedArtists = saved;
    renderSavedArtists(savedArtists);
  } catch( err ){ 
    console.log( `Could not save band to faves:`, obj, err );
  }
  // TODO: re-render
  // savedBands = saved;
} // saveBand()

init();
