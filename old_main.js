// https://essential-audio-player.net/


const params = new URLSearchParams(window.location.search);
const startUrl = params.get('url') ?? 'https://bmblackmidi.bandcamp.com/album/hellfire';

// const cors = 'http://localhost:9999/';
const cors = 'https://corsproxy.io/?';

// helpers
Object.prototype.l = function (x) {console.log('log:', this); return this; };
const l = console.log;
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

let baseElement = null;
let currentlyPlayingNode = null;
let lastPlayingNode = null;

function trunc(str, len){
  return str.length < 26 ? str : str.substring(0, 26) + '…';  
}

 function audioPlayHandler({target}) {
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
    playTitleNode.innerHTML = ` <span style="opacity: 0.5">&gt;</span> ${target.dataset.artist}`;   

    target.closest('.player').classList.add('playing');

}

function advanceTrack(ev, randomOrder=true){
  // actually 'ended' event handler

  ev?.target?.closest('.player').classList.remove('playing');

  const players = $$('audio');
  if( randomOrder ){
    let randomPlayer = ev.target; // guarantee 1 try below
  while( randomPlayer === ev.target ){
    randomPlayer = players[Math.floor(players.length * Math.random())];
    }
  randomPlayer.play();
  } else {
    // const justEnded = $$( 'audio' ).findIndex;
  }
} // advanceTrack()


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
  } catch( err ){
    console.warn('Error loading cached data for', url, err);
  data = await parsePage( url ); // Load actual live data from Bandcamp
  localStore( url, data );
  }

  const {artistName, tagsText, recs} = data;

  let nestingLevel = 0;

  if( isBase ){
    $('#mainTitle').innerHTML = `<span>${trunc(artistName)}</span>`;
  } else {
    // nested
    parent.firstElementChild.remove(); // loading message
    console.log( `parent`, parent );

    const tags = document.createElement('div');
    tags.className = 'tags';
    tags.innerHTML = tagsText.join(', ');
    parent.appendChild(tags);
    nestingLevel = parseInt(parent.dataset.nestingLevel); 
  }

  let playersNode = document.createElement('div');
  playersNode.className = 'players'
  // if(isBase) playersNode.style.marginTop = '3rem';
  playersNode.innerHTML += recs.map( r => recPlayerTemplate(r, nestingLevel) ).join('');
  parent.appendChild(playersNode);

  attachAudioHandlers(parent);

  // localStorage.setItem(`body::${url}`, document.body.innerHTML);

} // loadRecPlayers()


async function parsePage(url){

  const urlEnc = encodeURIComponent(url);
  const data = await (await fetch(cors + urlEnc)).text();
  // console.log( url, data );

  const recParts = data.split('class="recommended-album footer');

  const tags = data.split('a class="tag"');
  const tagsText = tags.slice(1).map(t => t.split('   >')[1].split('</a>')[0]);

// So funky
const artistName = data.split('id="name-section"')[1].split('href=')[1].split('>')[1].split('</a')[0];

// NASTY but beats parsing the HTML?
// Multiline formatting via: https://stackoverflow.com/a/34755045
// const regex = /data-audiourl="(?<audio>.*?)".*data-albumtitle="(?<album>.*?)".*data-artist="(?<artist>.*?)".*img class="album-art" src="(?<img>.*?)".*a class="album-link" href="(?<albumUrl>.*?)"(.*span class="comment-contents"\>(?<comment>.*?)\<\/span)?/ms;
const regex = new RegExp([
  /data-audiourl="(?<audio>.*?)".*/,
  /data-albumtitle="(?<album>.*?)".*/,
  /data-artist="(?<artist>.*?)".*/,
  /img class="album-art" src="(?<img>.*?)".*/,
  /a class="album-link" href="(?<albumUrl>.*?)(\?|").*/, // note literal ? to ignore querystring for album URL
  /(.*span class="comment-contents"\>(?<comment>.*?)\<\/span)?/,
].map(r => r.source).join(''), 's');

const recs = recParts.slice(1).map(r => regex.exec(r)?.groups);
// if( !recs ) console.warn('%cREGEX FAILED:');

return { artistName, tagsText, recs };  

} // parsePage()

function localStore(url, data) {
  try {
    localStorage.setItem(url, JSON.stringify(data));
  } catch (e) {
    console.warn('Error saving cached data for', url, data, err);
  }
}

function recPlayerTemplate(match, level) {
  return `
      <img class="thumb" src="${match.img}">
      <span class="player">
        <label class="artist" title="${ match.artist.length >= 26 ? match.artist : '' }">
          ${trunc(match.artist)}
        </label>
        <audio controls data-url="${match.albumUrl}" data-artist="${match.artist}" data-nesting-level="${level}">
          <source src=${match.audio.split('mp3-128&quot;:')[1].split('&quot;')[1]}>
        </audio>
      </span>
      <details class="children">
        <summary>
          <span data-loaded="false" data-url="${match.albumUrl}" class="open" style="font-size: 24pt; cursor: pointer">⤵︎</span>
        </summary>
        <div class="main" data-nesting-level="${level+1}">
          <div class="loading">Loading...</div>
        </div>
      </details>
    `;
}

function attachAudioHandlers(to){
  to.querySelectorAll('audio').forEach(a => {
    a.addEventListener('play', audioPlayHandler);
    a.addEventListener('ended', advanceTrack);
    a.addEventListener('pause', e => {
      e.target.closest('.player').classList.remove('playing');
    });
  }); // each audio
} // attachAudioHandlers()

function initHandlers() {

  // Using event delegation so these only need to be attached once on load
  // (Audio event handlers don't bubble and thus are added to each 
  // element after creation in loadRecPlayers())

  document.addEventListener('click', e => {
    const {target} = e;
    if( target.className === 'thumb'){
      return playOrOpen(e, target.nextElementSibling.children[1]);
    } 
    if( target.className === 'artist' ){
      return playOrOpen(e, target.nextElementSibling);
    } 
    
    if (target.className === 'open') {
      if (target.dataset.loaded === 'false') {
        target.dataset.loaded = 'true';
        target.innerHTML = '⤴︎';
        target.style.writingMode = 'sideways-lr';
        console.log(`CLICK`, target.closest('.children'));
        target.closest('.children').classList.add('open');
        loadRecPlayers(target.dataset.url, target.parentNode.nextElementSibling);
      } else {
        // collapse
        target.innerHTML = '⤵︎';
        target.style.writingMode = 'none';
      }
    }

  }); // click

  document.addEventListener('mousemove', e => {
    if (e.target.className === 'thumb' && e.shiftKey) {
      e.target.style.width = '40vw';
      e.target.style.position = 'absolute';
    }
  });
  document.addEventListener('mouseout', e => {
    // console.log(`me`, e.shiftKey);
    if (e.target.className === 'thumb') {
      e.target.style.width = '50px';
      e.target.style.position = 'static';
    }
  });

  document.addEventListener('keydown', e => {
    console.log(`key`, e.code);
    if (e.code === 'Space') {
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
      e.preventDefault();
    } else if (e.code === 'ArrowRight') {
      console.log(`Right`);
      e.preventDefault();
    } else if (e.code == 'BracketRight') {
      userAdvanceTrack();
    } else if (e.code == 'Period') {
      advanceTrack({ target: currentlyPlayingNode }); // actually to get random order
    } else if (e.code == 'KeyS') {
      console.log( `SAVE CURRENT!` );
      e.preventDefault();
    }
  });

  navigator.mediaSession.setActionHandler('nexttrack', function (ev) {
    //  Note: not received if browser not currently playing (FF MacOS)
    console.log(`MEDIA NEXT`, ev);
    userAdvanceTrack();
  });

} // initHandlers()

// Start the process 

async function init() {
  // if( !loadBodyFromCache(startUrl) ){
    await loadRecPlayers(startUrl, document.body);
  // }
  initHandlers();
};

function loadBodyFromCache(url){
  try {
    const body = localStorage.getItem(`body::${url}`);
    if( body === null ) return false;
    document.body.innerHTML = body;
    attachAudioHandlers(document);
    return true;
  } catch( err ) {
    console.log( `Could not load body from cache`, err );
  }
} // loadBodyFromCache()

init();
