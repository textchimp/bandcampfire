
/*

  - album play

  - random play error on mobile:
  "Unhandled Promise Rejection: NotAllowedError: The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission." 
  Line 220: randPlayer.play();
  "You might encounter the error when there is an async operation between the user interaction and playing of audio." i.e. DOESN'T work for "expand new" random when a fetch() is involved

  Shortcuts:
    - 's'  (while playing) save artist to faves
    - shift + click (on song) open in new tab


  TODO:

  - search
  curl -X POST -H 'Content-Type: application/json' -d '{ "search_text":"floatie","full_page":false,"search_filter":""  }' https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic
  search_filter: "b" for artist
  search_filter: "a" for album
  search_filter: "t" for track


  - "Various Artists" as title - better handling? Use album name instead? Save to LS  uniquely (using album)?

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
const APP_VERSION = '0.2.2';  // Change this to force reload of cached LocalStorage page data (per cached-band-obj)

// const cors = 'http://localhost:9999/';
const CORS_PROXY_URL = 'https://corsproxy.io/?';

// let REDIRECT_PROXY_URL = 'http://127.0.0.1:5001/functions-test-24b29/us-central1/getRedirect?k=allo&url=';
// if (navigator.userAgent.includes('Mobi')) {
  const REDIRECT_PROXY_URL = 'https://us-central1-functions-test-24b29.cloudfunctions.net/getRedirect?k=allo&url=';
// } // mobile-only


// helpers
// Object.prototype.l = function (x) {console.log('log:', this); return this; };
const l = console.log;
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

let baseElement = null;
let currentlyPlayingNode = null;
let lastPlayingNode = null;
const playHistory = []; // TODO
let playingAlbumTrack = null;  // !== null means it's album play mode

let savedArtists = loadSavedArtists();
// console.log( `saved artists:`, Object.keys(savedArtists).join(', ') );

const songTree = { [startUrl]: { children: {}, status: null } };
let currentSongTreeNode = songTree[startUrl];


let controlsGui = null;

const controls = {
  randomAdvance: true,
  randomExpandNewProb: 0.5,
};


let mainAudioPlayer = $('#mainPlayer');

const headerNode = $('header');

// from drag-from-edge touch events
let startDragAtBorder = false;

let longPressAlbumArtTimer = null;

const getArtUrl = (id, size = '5', pad=true) => {
  const paddedId = pad ? id.toString().padStart(10, '0') : id;
  return `https://f4.bcbits.com/img/a${paddedId}_${size}.jpg`; 
};
// '_1.jpg' gives large size! 5 is good too, not too big; 6 is smallest thumbnail // 16 is good! full screen but not original max size




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
  // e.target.closest('.player').classList.remove('playing');
  // $('header img').style.display = 'none';
}

 function audioPlayHandler({target}) {
  // TODO: broken
  console.log( `audioPlayHandler()` );
  // currentlyPlayingNode = target;
  // $$('audio').forEach(el => el !== target && el.pause());
  console.log( `new play level:`, target.dataset.nestingLevel );

  // TODO: Remove deeper levels breadcrumb  when newest playing is from a higher level
  // let playTitleNode = document.querySelector(`#mainTitle .playing[data-nesting-level="${target.dataset.nestingLevel}"]`);
  // if( !playTitleNode ){
  //   // playTitleNode = document.createElement('span');
  //   // playTitleNode.className = 'playing';
  //   // playTitleNode.dataset.nestingLevel = target.dataset.nestingLevel;
  //   // document.querySelector('#mainTitle').appendChild(playTitleNode);
  // } 
  // playTitleNode.innerHTML = `<span>&gt;</span>${target.dataset.artist}`;   

  // target.closest('.player').classList.add('playing');

  const headerImg = $('header img');
  // console.log( `playing node:`, currentlyPlayingNode );
  // headerImg.src = currentlyPlayingNode.dataset.image;
  headerImg.style.display = 'inline';
} //audioPlayHandler()


function trackEnded(){
  // Track reached a natural end - add to recently played list
  // TODO: what about when you skip a track? Shouldn't this also add
  // TODO    to recently-played?
  advanceTrack();
  console.log(`track end:`, Date.now() );
} // trackEnded()


function previousTrack(){
  // alert('prev');
  console.log( `previousTrack()` );
  if( !lastPlayingNode ) return;
  let tempCurrent = currentlyPlayingNode;
  currentlyPlayingNode = lastPlayingNode;
  lastPlayingNode = tempCurrent; // TODO: this just toggles back and forth; create array and move through it instead
  loadAudio(currentlyPlayingNode.dataset);
  $('.playing')?.classList.remove('playing');
  currentlyPlayingNode.classList.add('playing');
  currentlyPlayingNode.scrollIntoView({ behavior: "smooth", inline: "nearest" });

} // previousTrack()

function advanceTrack(randomOrder=false){
  // actually 'ended' event handler
  console.log( `%cadvanceTrack()`, 'color: orange; font-weight: bold' );

  const players = $$('.playerWrapper');

  if( playingAlbumTrack !== null ){
    // inc track
    // playingAlbumTrack.currentIndex = ();

    const alb = playingAlbumTrack;
    alb.currentIndex = (alb.currentIndex + 1) % alb.tracks.length;
    playAlbumTrack( alb.tracks[alb.currentIndex], alb.currentIndex, alb.parent );
    return;
  }
  
  if( controls.randomAdvance || randomOrder ){

    if( Math.random() < controls.randomExpandNewProb ){
      quickNastyRandomExpand();
    } else {

      // Normal random
      let randomPlayer = { audioSrc: mainAudioPlayer.src }; // guarantee 1 try below
      while( randomPlayer.audioSrc === mainAudioPlayer.src ){
        randomPlayer = players[Math.floor(players.length * Math.random())];
      }
      // randomPlayer.play();
      lastPlayingNode = currentlyPlayingNode;
      currentlyPlayingNode = randomPlayer;
      loadAudio( randomPlayer.dataset );
      $('.playing')?.classList.remove('playing');
      randomPlayer.classList.add('playing');
      randomPlayer.scrollIntoView({ behavior: "smooth", inline: "nearest" });

    }

  } else {
    // Play next track in list

    // TODO: copy this data to attribute of <audio> instead
    const allPlayers = $$('.playerWrapper');

    if( !mainAudioPlayer.src ){
      //  No last-playing, play first in list
      $('.playing')?.classList.remove('playing');
      loadAudio(allPlayers[0].dataset);
      allPlayers[0].classList.add('playing');
      return;
    }

    let playingIndex = [...allPlayers].findIndex( p => p.dataset.audioSrc === mainAudioPlayer.src );
    if( playingIndex >= 0 ){
      if( playingIndex === allPlayers.length-1 ){
        playingIndex = -1; // wrap
      }
      $('.playing')?.classList.remove('playing');
      loadAudio( allPlayers[playingIndex+1].dataset );
      allPlayers[playingIndex + 1].classList.add('playing');
      lastPlayingNode = currentlyPlayingNode;
      currentlyPlayingNode = allPlayers[playingIndex + 1];
    }

  }
} // advanceTrack()

async function quickNastyRandomExpand(){

  const unopened = $$('.opener[data-loaded="false"]');
  const randy = unopened[Math.floor(Math.random() * unopened.length)]
  randy.scrollIntoView({ behavior: "smooth", inline: "nearest" });
  randy.click();

  const childRecs = randy.parentElement.nextElementSibling;
  await waitForElementToExistAt('.playerWrapper', childRecs);

  const players = childRecs.querySelectorAll('.playerWrapper');
  const randPlayer = players[Math.floor(Math.random() * players.length)];
  lastPlayingNode = currentlyPlayingNode;
  currentlyPlayingNode = randPlayer;
  loadAudio( randPlayer.dataset );
  $('.playing')?.classList.remove('playing');
  randPlayer.classList.add('playing');
  randPlayer.scrollIntoView({ behavior: "smooth", inline: "nearest" });

}

function userAdvanceTrack(){

  // const players = [...$$('audio')];
  // const playingIndex = players.findIndex(a => a.duration > 0 && !a.paused);
  // console.log(`found`, playingIndex);
  // let nextIndex = playingIndex + 1;
  // if (nextIndex > players.length - 1) {
  //   nextIndex = 0;
  // }
  // console.log(`playing`, playingIndex, nextIndex);
  // players[nextIndex].play();
}

function playToggle(parent){

  if( !parent ){
    mainAudioPlayer.paused ? mainAudioPlayer.play() : mainAudioPlayer.pause();
    return;
  }
  // console.log( `playToggle`, parent.dataset, mainAudioPlayer );

  // Play if paused, or if clicked track is different to playing track
  if( mainAudioPlayer.src == parent.dataset.audioSrc ){ 
    // Unpause if same track
    mainAudioPlayer.paused ? mainAudioPlayer.play() : mainAudioPlayer.pause();
  } else {
    lastPlayingNode = currentlyPlayingNode;
    currentlyPlayingNode = parent;
    loadAudio(parent.dataset);
    $('.playing')?.classList.remove('playing');
    parent.classList.add('playing');
  }

  // if( mainAudioPlayer.paused || mainAudioPlayer.src !== parent.dataset.audioSrc){
  //   loadAudio(parent.dataset);
  //   $('.playing')?.classList.remove('playing');
  //   parent.classList.add('playing');
  // } else {
  //   mainAudioPlayer.pause();  
  // }

} // playToggle()

function loadAudio( args ){
  // mainAudioPlayer.firstElementChild.src = args.audioSrc;
  updatePlayerUi(args);
  mainAudioPlayer.src = args.audioSrc;
  
  mainAudioPlayer.load();
  mainAudioPlayer.play();

  // console.log( `current`, currentlyPlayingNode );
} // loadAudio()

function updatePlayerUi( args ){
  $('#player .artist-name').innerHTML = trunc(args.artist, 40);
  
  // We only know the name of the track for album tracks, not recs
  $('#player .song-title').innerHTML = args.title || '(recommended track)';
  // $('#player .song-title').innerHTML = args.

  $('#player .image img').src = args.image;

  document.title = `🔥 ${args.artist}` + (args.title ? ` - '${args.title}' ` : ''); // | BandcampFire

} // updatePlayerUi()

function playOrOpen(ev, parent) {
  // TODO: shiftKey NOT AVAILABLE for mobile
  if (ev.shiftKey) {
    window.open(parent.dataset.url, '_blank');
    ev.preventDefault();
  } else {
    playToggle(parent);
  }
}


async function loadRecPlayers(url, parent) {

  let isBase = false;

  // console.log( `baseElement`, baseElement );

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
    console.log('LS cache load: ', err.message, url);
    data = await parsePage( url ); // Load actual live data from Bandcamp
    console.log(`%cPage data RE-FETCHED`, 'color:green' );
    if(!data){
      // $('#mainTitle').innerHTML = `<span style="color: orange">Could not load URL ("${ url }")</span>`;
      return false;
    }
    // console.log( 'data', data );
    data.__version = APP_VERSION; 
    localStore( url, data );
  }

  const { artistName, tagsText, recs, albumTracks, imageUrl } = data;
  console.log( `loadRecPlayers() data`, data );

  // if( !artistName ) debugger;

  let nestingLevel = 0;

  // if( isBase ){} else {}

  if( false ){  // isBase
    // $('#mainTitle').innerHTML = `<span>${trunc(artistName)}</span>`;
  } else {
    $('#player .artist-name').innerHTML = trunc(artistName, 40);
    // nested

    $('#player .image > img').src = imageUrl;

    // parent.firstElementChild.remove(); // loading message
    parent.replaceChildren('');

    // Album player
    // const parentPlayer = parent.parentElement.querySelector('audio'); 
    // TODO: doesn't work because parent .playerWrapper is missing for attribs? Add dummy?

    // for base: parent (#players)
    // for nested; parent.parentElement (.playerWrapper)

    if( isBase ){
      // To make album player work for top-level band
      parent.dataset.artist = artistName;
      parent.dataset.image = imageUrl;
      parent.dataset.url = url;
      parent.dataset.nestingLevel = 0;  // or should just be .nesting ?
      parent.dataset.audioSrc = albumTracks[0].audio;

      // Make play button have a default to work with on top-level band
      // (first song from album)
      mainAudioPlayer.src = albumTracks[0].audio;
      $('#player .song-title').innerHTML = albumTracks[0].title;
      // alert(1)

      // To make "save artist" work
      currentlyPlayingNode = parent;
    }

  // console.log( `albumTracks`, albumTracks );

    const albumParent = isBase ? parent : parent.parentElement;
    // console.log( `parent elem for album`, albumParent );
    parent.appendChild( renderAlbumPlayer(albumTracks, albumParent) ); 
    
    // Tags list
    parent.appendChild( renderTags(tagsText) );

    nestingLevel = parseInt(parent.dataset.nestingLevel); 
  }

  let playersNode = document.createElement('div');
  playersNode.className = 'players';
  playersNode.innerHTML += recs.map( r => recPlayerTemplate(r, nestingLevel) ).join('');
  parent.appendChild(playersNode);

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

function renderAlbumPlayer( tracks, parent ){
  const player = document.createElement('div');
  player.className = 'albumPlayer';
  let currentIndex = -1;
  let totalTracks = tracks.length;
  player.innerHTML = `<div><a href="${parent.dataset.url}" target="_new" title="Open in new tab">Album:</a> <span>1/${totalTracks}. ${tracks[0].title}</span></div>`;
  player.addEventListener('click', e => {
    currentIndex = (currentIndex + 1) % totalTracks;    
    
    playingAlbumTrack = {tracks, currentIndex, parent};

    player.innerHTML = `<div><a href="${parent.dataset.url}" target="_new" title="Open in new tab">Album:</a> <span>${currentIndex + 1}/${totalTracks}. ${tracks[currentIndex].title}</span></div>`;
   
    player.dataset.playing = true;
    e.target.classList.add('playing');

    playAlbumTrack( tracks[currentIndex], currentIndex, parent );
    
  });

  return player;
} // renderAlbumPlayer()

function udpateAlbumPlayerUi(player){
} // udpateAlbumPlayerUi()

function playAlbumTrack(track, index, parent){
  console.log( `playAlbumTrack`, {track, index, parent} );
  currentlyPlayingNode = parent; // TODO: won't get song title right! (Doesn't matter for artist save)
  loadAudio({
    artist: parent.dataset.artist,
    title: (index + 1) + '. ' + track.title,
    image: parent.dataset.image,
    url: parent.dataset.url,
    audioSrc: track.audio
  });

} // playAlbumTrack()


async function getAlbumUrlFromLabelPage(urlEnc){
  
  $('#players').innerHTML = '<div class="loading">Loading album from label...</div>';

  try {
    data = await (await fetch(CORS_PROXY_URL + urlEnc)).text();
  } catch (error) {
    console.log(`getAlbumUrlFromLabelPage(): Bad URL?`, CORS_PROXY_URL + urlEnc);
    return null;
  }

  // const parser = new DOMParser();
  // const pageDom = parser.parseFromString(data, 'text/html');
  const albumPath = data.split('id="music-grid"')[1].split('a href="')[1].split('"')[0];

  // Need to decode because full URL is used for cache key (and encoded again for page load+parse)
  return decodeURIComponent(urlEnc) + albumPath;
} // getAlbumUrlFromLabelPage()


async function getRedirectedAlbumPage(urlEnc){
  // TODO: gotta be a way to do this that doesn't require
  // TODO:  server-side code/cloud function; but CORS blocks everything?

  // Special case handling for search result URLs,
  // (which are just a domain with no path to an album)
  // since they are just the host/domain with no path
  // and always trigger a 303 rediret to an album from
  // bandcamp

  // corsChoice = 'http://www.whateverorigin.org/get?url='; // SOMETIMES
  // corsChoice = 'https://api.allorigins.win/get?url='; // works SOMETIMES

  let newUrl;
  
  try {
    const res = await fetch(REDIRECT_PROXY_URL + urlEnc);

    if( res.status === 422 ){
      // this page did not redirect, i.e. it is a label
      // page (just albums, no songs directly);
      // load it and scrape the first album from the list
      newUrl = await getAlbumUrlFromLabelPage(urlEnc);
    } else {
      // Standard redirect, body text is new URL
      newUrl = await res.text();
    }
    
    console.log( `getRedirectedAlbumPage():` );
    console.log( `old:`, urlEnc );
    console.log( `new:`, newUrl );
    return newUrl;
  } catch (error) {
    console.log( `Redirect URL fetch error:`, error );
    // alert(`get redirect failed: ${error.message}`)
    throw 'Redirect error';
    return null;
  }

} // getRedirectedAlbumPage()


async function parsePage(url){

  let urlEnc = encodeURIComponent(url);

  let data = null;

  try {
    data = await (await fetch(CORS_PROXY_URL + urlEnc)).text();
  } catch (error) {
    console.log( `Bad URL?`, CORS_PROXY_URL + url );
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
  // WHY?! Why are pages either "blobs + no HTML" or "no blobs + HTML" ???? What am I missing?
  if( pageBlob ){

    console.log( `Page: JSON BLOB mode` );

    const pageMeta = JSON.parse(pageBlob.dataset.pagedataBlob);
    // console.log(`pageMeta`, pageMeta);

    const recData = pageMeta.recommendations_footer.album_recs;
    // console.log(`art`, recData);
    
   
    // console.log(`recs BLOB`, pageMeta.recommendations_footer.album_recs[0] );

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

  const albumTracks = albumData.trackinfo
    .filter( t => t.file ) // Skip any tracks without 'file' key (i.e. audio src) defined
    .map( t => ({
      audio: t.file['mp3-128'], 
      title: t.title, 
      url: t.title_link, 
      id: t.id
    }) );
  // console.log( `album`, albumData, albumTracks );


// console.timeEnd('DOM parse');
console.log('parsePage() loaded artist object', { artistName, tagsText, recs, albumTracks } );

  // <meta property="og:image" content="https://f4.bcbits.com/img/a0431503262_5.jpg"></meta>

  const mainImg = pageDom.head.querySelector('meta[property="og:image"');
  // console.log( `IMAGE`, mainImg, mainImg.content );
  const imageUrl = mainImg.content;

return { artistName, tagsText, recs, albumTracks, imageUrl };  

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
  <div class="playerWrapper"
    data-url="${match.albumUrl}" 
    data-artist="${match.artist}"
    data-image="${match.img}" 
    data-nesting-level="${level}"
    data-audio-src="${ match.audio }"
  >
  
    <div class="thumb">
      <a href="${match.albumUrl}" target="_blank" title="(Use context menu to open album page in new tab)">
        <img class="album-image" src="${match.img}" title="">
      </a>
      <span class="artist">${trunc(match.artist, 40)}</span>
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


// function attachAudioHandlers(to){
//   to.querySelectorAll('audio').forEach(a => {
//     a.addEventListener('play', audioPlayHandler);
//     a.addEventListener('ended', advanceTrack);
//     a.addEventListener('pause', audioPauseHandler);
//   }); // each audio
// } // attachAudioHandlers()


function initHandlers() {

  initMobileHandlers();

  // Using event delegation so these only need to be attached once on load
  document.addEventListener('click', async e => {
    
    const {target} = e;
    
    console.log( `CLICK`, target.className );
    // alert(target.className)

    if( (target.className === '' || target.className === 'players') && $('#menu').classList.contains('open')){
      $('#menu').classList.remove('open');
    }

    // TODO: these don't need to be in the delegated click handler
    // Pause toggle for band/song name/album art in header
    // if( target.className === 'controls' ){
    //   advanceTrack();
    // }

    // , 'header-album-image'
    // if (['artist-name', 'song-title'].includes(target.className) ){
    //   return playToggle(); // no arg to just pause/play
    // }

    // end remove-TODO



    // Click thumbnail or band name to toggle play
    if( ['artist', 'thumb', 'album-image'].includes(target.className) ){
      playingAlbumTrack = null;
      playOrOpen( e, e.target.closest('.playerWrapper') );
      e.stopPropagation(); // prevent link click (need to use context menu)
      e.preventDefault();
      return;
    }

    // // Click thumbnail or band name to toggle play
    // if( target.parentNode.className === 'thumb'){
    //   return playOrOpen(e, target.parentNode.parentNode.querySelector('audio') );
    // } 
    // if( target.className === 'artist' ){
    //   return playOrOpen(e, target.nextElementSibling);
    // } 
    

    // Open button for following rec band (nesting)
    if (target.className === 'opener') {
      const childrenNode = target.parentNode.nextElementSibling;
      if (!childrenNode.classList.contains('opened') ){

        target.innerHTML = '⤴︎';
        target.style.writingMode = 'sideways-lr';
        target.style.color = 'lightblue';
        // console.log(`CLICK`, target, 'children:', childrenNode);
        childrenNode.classList.add('opened');

        // console.log(`LOADED:`, childrenNode.dataset.loaded );
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

    // Search form: cancel other key events except ESC and up/down/enter
    if(e.target.id === 'searchText'){
      if( e.code === 'Escape' ){
        // Hide search results modal
        $('#searchResults').classList.remove('active');
      } else if( e.code === 'ArrowDown' ){
        // alert('next');
      } else if( e.code === 'ArrowUp' ){
        // alert('prev');
      }
      return;
    } // search input

    console.log(`key`, e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      
      if( mainAudioPlayer.src ){
        mainAudioPlayer.paused ? mainAudioPlayer.play() : mainAudioPlayer.pause();
      } else {
        // TODO: Choose random to start
      }

      //   mainAudioPlayer.pause();
      //   lastPlayingNode = currentlyPlayingNode;
      //   currentlyPlayingNode = null;
      // } else {
      //   if (lastPlayingNode) {
      //     lastPlayingNode.play();
      //     currentlyPlayingNode = lastPlayingNode;
      //     return;
      //   }
      //   // $$('audio')?.play();
      //   // TODO: play rand on space
      //   // const players = $$('.playerWrapper');
      //   // const rand = players[Math.floor(players.length * Math.random())];
      //   // rand.play();
      //   // currentlyPlayingNode = rand;
      // }


    } else if (e.code === 'ArrowRight') {
      console.log(`Right`);
      e.preventDefault();
    } else if (e.code === 'BracketRight') {
      userAdvanceTrack();
    } else if (e.code === 'Period') {
      advanceTrack(); // actually to get random order
    } else if (e.code === 'Slash') {
      // console.log( `Jump 33% current track` );
      currentlyPlayingNode.currentTime += (currentlyPlayingNode.duration / 4.0);
    } else if (e.code === 'KeyS') {
      console.log( `SAVE CURRENT!`, currentlyPlayingNode );
      if (currentlyPlayingNode ){
        saveArtist( currentlyPlayingNode.dataset );
      }

      e.preventDefault();
    } else if (e.code === 'KeyF') {
      // Hide search results modal
      $('#searchResults').classList.add('active');
      $('#searchText').focus();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.code === 'KeyM') {
      $('#menu').classList.add('open');
    } else if( e.code === 'Escape' ){
      $('#searchResults').classList.remove('active');
      $('#menu').classList.remove('open');
    } else if (e.code === 'KeyP') {
      previousTrack();
      e.preventDefault();
      e.stopPropagation();
    }
     
  });


  navigator.mediaSession.setActionHandler('nexttrack', function (ev) {
    //  Note: not received if browser not currently playing (FF MacOS)
    console.log(`MEDIA NEXT`, ev);
    // userAdvanceTrack(); // literal next track: TODO
    advanceTrack();                    
  });

  window.addEventListener("paste", (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData("text");
    if(pasted.startsWith('http') && pasted.includes('bandcamp.com')){
      // window.location = `?url=${pasted}`;
      
      // Almost works; need to:
      // - reset top title, (image?)
      // - define as base, not child (get album links) ... or is this an improvement?
      //    - alnum play doesn't work because no parent!
      baseElement = null; 
      loadRecPlayers(pasted, document.querySelector('#players'), songTree[pasted]);
    }
  });

  // mainAudioPlayer.addEventListener('play', audioPlayHandler); // not really working?
  // TODO: use updatePlayerUi ??

  mainAudioPlayer.addEventListener('ended', trackEnded);
  
  mainAudioPlayer.addEventListener('pause', audioPauseHandler);

  // window.addEventListener('resize', e => {
  //   alert('res')
  //   headerNode.width = window.innerWidth;
  // });


  // from https://signalvnoise.com/posts/2407-device-scale-user-interface-elements-in-ios-mobile-safari
  function getDeviceScale() {
    var deviceWidth, landscape = Math.abs(window.orientation) == 90;
    if (landscape) {
      // iPhone OS < 3.2 reports a screen height of 396px
      deviceWidth = Math.max(480, screen.height);
    } else {
      deviceWidth = screen.width;
    }
    return window.innerWidth / deviceWidth;
  }

  // mobile only - keep the position:fixed header at constant size when page is zoomed
  if (navigator.userAgent.includes('Mobi')) {
    window.addEventListener('gestureend', function (e) {
      if (e.scale < 1.0) {
        // User moved fingers closer together
      } else if (e.scale > 1.0) {
        // User moved fingers further apart
      }

      // var ds = getDeviceScale();
      // $('.device-fixed-height').style.transform = 'scale(1,' + ds + ')';
      // $('.device-fixed-height').style.transformOrigin = '0 0';
      // $('.device-fixed-width').style.transform = 'scale(' + ds + ',1)';
      // $('.device-fixed-width').style.transformorigin = '0 0';

      // headerNode.style.position = 'absolute';
      // alert($('.players').scrollTop)
      // headerNode.style.top = '0px';


    }, false);
  }

} // initHandlers()


function initMobileHandlers(){

  // mobile events

  const headerDetails = $('#playerDetails');
  const detailsMgr = new Hammer.Manager(headerDetails);

  // detailsMgr.add(new Hammer.Tap({ event: 'doubletap', taps: 2 }));
  detailsMgr.add(new Hammer.Tap({ event: 'singletap' }));
  detailsMgr.add(new Hammer.Press({ event: 'longpress', time: 1000 }));

  detailsMgr.add(new Hammer.Swipe({ event: 'swipe' }));

  // detailsMgr.get('doubletap').recognizeWith('singletap');
  // detailsMgr.get('singletap').requireFailure('doubletap');

  detailsMgr.on('swipeleft', previousTrack );
  
  detailsMgr.on('swiperight', advanceTrack );

  detailsMgr.on('swipedown', e => {
    if( !mainAudioPlayer.paused ) {
      mainAudioPlayer.currentTime += (mainAudioPlayer.duration / 3.0);
    }
  });

  detailsMgr.on('swipeup', e => alert('det up'));

  detailsMgr.on('singletap', e => {
    playToggle();
  });
  
  // detailsMgr.on('doubletap', e => {
  // });

  detailsMgr.on('longpress', e => {
    currentlyPlayingNode?.scrollIntoView();
  });

  // Header details text mobile events

  
  const headerImg = $('#player .image img');
  const mc = new Hammer.Manager(headerImg);
  // We create a manager object, which is the same as Hammer(), but without the preset recognizers. 
  // Tap recognizer with minimal 2 taps (from https://codepen.io/jtangelder/pen/xxYyJQ) via Examples page
  // mc.add(new Hammer.Tap({ event: 'doubletap', taps: 2 }));
  mc.add(new Hammer.Tap({ event: 'singletap' }));
  mc.add(new Hammer.Press({ event: 'longpress', time: 1000 }));
  mc.add(new Hammer.Swipe({ event: 'swipe' }));

  mc.on('swipeleft', e => {
    alert('img left')
    // window.open(currentlyPlayingNode.dataset.url, '_blank');
  });

  mc.on('swipedown', openMenu );
  mc.on('swipeup',   showSearchPanel );

  mc.on('swiperight', e => {
    alert('img right');
  } );

  // mc.get('doubletap').recognizeWith('singletap');
  // mc.get('singletap').requireFailure('doubletap');

  mc.on('singletap', e => {
    if( $('#menu').classList.contains('open') ){
      $('#menu').classList.remove('open');
      return;
    }
    playToggle(); // Causes slight delay before single tap recognised (due to double check)
  });

  // mc.on('doubletap', e => {
  //   if (confirm('Save artist?')) {
  //     saveArtist(currentlyPlayingNode.dataset);
  //   }
  // });


  mc.on('longpress', e => { 
    // if(confirm('Visit band page?')){
    // if( currentlyPlayingNode ){
    // window.open(currentlyPlayingNode.dataset.url, '_blank');
    // windowReference.location = currentlyPlayingNode.dataset.url;
    // }
    if (confirm('Save artist?')) {
      saveArtist(currentlyPlayingNode.dataset);
    }
  });


  // mc.on("singletap doubletap", function (ev) {
  //   alert(ev.type)
  // });


  // 'Next' button (toggle mode with long press) // TODO: swipe down?
  const nextBtnManager = new Hammer.Manager($('#player .controls'));
  // nextBtnManager.add(new Hammer.Tap({ event: 'doubletap', taps: 2 }));
  nextBtnManager.add(new Hammer.Tap({ event: 'singletap' }));
  nextBtnManager.add(new Hammer.Press({ event: 'longpress', time: 1000 }));
  // nextBtnManager.get('doubletap').recognizeWith('singletap');
  // nextBtnManager.get('singletap').requireFailure('doubletap');

  nextBtnManager.on('singletap', () => {
    playingAlbumTrack = null; // switch off album sequence mode
    advanceTrack()
  });

  nextBtnManager.on('longpress', e => {
    controls.randomAdvance = !controls.randomAdvance;
    e.target.dataset.advanceMode = controls.randomAdvance; // need this?
    e.target.innerHTML = controls.randomAdvance ? '↬' : '↦';
  });


  // Pre-Hammer handling
  // $('#player .artist-name').addEventListener('touchstart', (e) => {
  //   playToggle();
  //   e.preventDefault();
  // });

  // // We only know the name of the track for album tracks, not recs
  // $('#player .song-title').addEventListener('touchstart', (e) => {
  //   playToggle();
  //   e.preventDefault();
  // });

  // $('#player .image img').addEventListener('touchstart', playToggle);
  // $('#player .controls').addEventListener('touchstart', advanceTrack);

  // Down swipe from top right edge to open dat.gui control panel
  /* Not used for now, swipe gesture still a bit funny
  document.addEventListener('touchstart', function (e) {
    // var yPos = e.originalEvent.touches[0].pageY;
    startDragAtBorder = e.changedTouches[0].pageY < 50 && e.changedTouches[0].pageX > (window.innerWidth * 0.7);
    // alert( startDragAtBorder );
  }); // touchstart
  document.addEventListener('touchend', function (e) {
    if(
      startDragAtBorder && e.changedTouches[0].pageY > 50 && 
      e.changedTouches[0].pageY < (window.innerHeight/3)
    ){
      // alert('edge down swipe!');
      controlsGui.toggleHide();
      if( !controlsGui.isHidden() ){
        controlsGui.open();
      } 
      e.preventDefault();
      e.stopPropagation();
    }
  }); // touchend
  */



  // Mobile swipe handler code
  // from https://stackoverflow.com/a/62825217

  // const heading = $('header');

  // heading.addEventListener('touchstart', function (event) {
  //   touchstartX = event.changedTouches[0].screenX;
  //   touchstartY = event.changedTouches[0].screenY;
  //   event.preventDefault(); // no scrolling
  // }, false);

  // heading.addEventListener('touchend', function (event) {
  //   touchendX = event.changedTouches[0].screenX;
  //   touchendY = event.changedTouches[0].screenY;
  //   handleGesture(event);
  // }, false);


} // initMobileHandlers()


// function handleGesture(ev) {
//   if (ev.target.nodeName === 'AUDIO') {
//     ev.stopPropagation();
//     return;
//   }

//   const SWIPE_DISTANCE_THRESHOLD = window.innerWidth * 0.175;

//   const passedThreshold = Math.abs(touchendX - touchstartX) > SWIPE_DISTANCE_THRESHOLD;

//   if (!passedThreshold) return;

//   if (touchendX < touchstartX) {
//     // alert('Swiped Left');
//   }

//   if (touchendX > touchstartX) {
//     // alert('Swiped Right');
//     advanceTrack({ target: currentlyPlayingNode }); // actually to get random order
//   }


//   // These need fine-tuning to work well, i.e vert swipe must be N times larger than horiz, or vice versa

//   // if (touchendY < touchstartY) {
//   //   alert('Swiped Up');
//   // }

//   // if (touchendY > touchstartY) {
//   //   alert('Swiped Down');
//   // }

//   // if (touchendY === touchstartY) {
//   //   console.log('Tap');
//   // }

// } // handleGesture()

// swipe


// Start the process 


function openMenu(){
  $('#menu').classList.toggle('open');  
} // openMenu()

async function init() {
  // if( !loadBodyFromCache(startUrl) ){
    await loadRecPlayers(startUrl, document.querySelector('#players'), songTree[startUrl]);
  // }
  initHandlers();
  renderSavedArtists(savedArtists);

  // initControlPanel(); // Not using for now

}; // init()

function initControlPanel(){

  controlsGui = new dat.GUI(); //({ closed: true });
  const randomFolder = controlsGui.addFolder('Random');
  randomFolder.add(controls, 'randomAdvance').name('Random Next');
  randomFolder.add(controls, 'randomExpandNewProb', 0.0, 1.0).name('Expand Prob.');
  randomFolder.open();

  controlsGui.close();
  controlsGui.toggleHide(true); // force hide

} // initControlPanel()

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


function showSearchPanel(){
  $('#searchResults').classList.add('active');
  $('#searchText').focus();
} // showSearchPanel()

async function search(text){
  const params = {
    method: "post",
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      search_text: text || "floatie", 
      search_filter: "b", // band (a=artist, t=track)
      full_page: false, 
      // max_results: 10  // is there a limit param?
    })
  };
  const json = await fetch(CORS_PROXY_URL + 'https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', params);
  const res = await json.json();
  // console.log( `res`, res.auto.results.map(r => `${r.name} :: ${r.location}`) );
  // console.log( res );
  renderSearchResults( res.auto.results );
} // search()


function renderSearchResults( items ){
  console.log( `renderSearchResults():`, items );
  const container = $('#searchResults .results');
  container.replaceChildren('');
  
  const resultsParent = $('#searchResults');
  resultsParent.classList.add('active');
  // $('#searchResults').classList.add('active');

  if( items.length === 0 ){
    console.log( container );
    container.innnerHTML = `<span>No results yet. Keep trying...</span>`;
    return;
  }

  console.log( `search items:`, items.length );

  const nodes = items.slice(0, 10).map( item => {
    const node = document.createElement('div');
    node.className = 'result';
    node.dataset.url = item.item_url_root;
    // TODO: also check 'item_url_path' for albums

    // TODO: use getArtUrl if you can work out img_id/art_id issues
    const tags = item.tag_names && item.tag_names.length > 0 ?
      trunc(item.tag_names.join(', '), 70)
      : '';
    node.innerHTML = `
      <div class="image"><img src="${item.img}" alt="${item.name}"></div>
      <div class="details">
        <div class="title"> ${item.name}</div>
        <div class="location">${item.location}</span>
        <div class="result-tags">${trunc(tags, 40)}</div>
      </div>
    `;
    // item_url_root, tag_names['']
    return node;
  });
  container.append(...nodes);
} // renderSearchResults()

$('#searchText').addEventListener('input', e => {
  const query = e.target.value;
  if( query.length > 2 ){
    search(query);  
  }
});



$('#closeSearchResults').addEventListener('click', e => {
  $('#searchResults').classList.remove('active');
  e.stopPropagation();
});

$('#searchResults .results').addEventListener('click', e => {
  const url = e.target.closest('.result').dataset.url;
  $('#searchResults').classList.remove('active');
  loadSearchResult(url);
  e.stopPropagation();
});


// $('#searchButton').addEventListener('click', e => {
//   $('#searchResults').classList.add('active');
//   $('#searchText').focus();
// });

async function loadSearchResult(url){

  $('#players').innerHTML = '<div class="loading">Loading...</div>';
  $('#player .song-title').innerHTML = 'Loading...';
  $('#player .artist-name').innerHTML = 'Loading...';
  $('#player .image img').src = 'https://placekitten.com/80/80';


  const urlParts = new URL(url);
  // console.log( 'host:', urlParts.hostname );
  // console.log( 'path:', urlParts.pathname );
  if (urlParts.pathname === '/') {
    // search results URLs require a redirect (cors proxy can't handle it)
    url = await getRedirectedAlbumPage(encodeURIComponent(url));
  } 
  baseElement = null; // full tree reload
  loadRecPlayers(url, document.querySelector('#players'), songTree[url]); 
} // loadSearchResult()

// Search testing:
// $('#searchResults').classList.add('active');
// const _searchInput = $('#searchText');
// _searchInput.selectionStart = _searchInput.selectionEnd = _searchInput.value.length;
// _searchInput.focus();
// 
// localStorage.removeItem("https://floatiehq.bandcamp.com");
// alert(localStorage.getItem("https://floatiehq.bandcamp.com/"))