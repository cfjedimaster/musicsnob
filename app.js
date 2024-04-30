// defaults for dev
let clientId = "c4f48d760b304e64a3c569941a47c36b";
let redirectUri = "http://127.0.0.1:8080/";

if(window.location.hostname.indexOf('netlify') >= 0) {
	clientId = '75412937c6ce4352896bc31d8bfe7df8';
	redirectUri = 'https://musicsnob.netlify.app/';
}

document.addEventListener('alpine:init', () => {
  Alpine.data('musicSnob', () => ({
	accessToken:null,
	loggedIn:false,
	code:null,
	status:'',
	profile:null,
	topArtists:[],
	topTracks:[],
	avgArtistPop:null,
	avgTrackPop:null,
	avgAverage:null,
	combiner:new Intl.ListFormat('en', { style:'long', type:'conjunction' }), 
	async init() {
		console.log('init');

		/*
		We can use an access token for an hour - so I've got a method that will
		check session storage for the item, AND see if it's expired.
		*/
		let existingToken = this.getCachedToken();
		if(existingToken) {
			this.accessToken = existingToken;
			this.loggedIn = true;
			this.getData();
		} else {

			const params = new URLSearchParams(window.location.search);
			this.code = params.get("code");
			if(this.code) {
				this.loggedIn = true;
				this.accessToken = await this.getAccessToken(clientId, this.code);
				//remove code from the url
				window.history.replaceState(null,'', '/');
				this.getData();
			}
		}
	},

	async generateCodeChallenge(codeVerifier) {
		const data = new TextEncoder().encode(codeVerifier);
		const digest = await window.crypto.subtle.digest('SHA-256', data);
		return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	},
	generateCodeVerifier(length) {
		let text = '';
		let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

		for (let i = 0; i < length; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	},
	async getAccessToken(clientId, code) {
		const verifier = sessionStorage.getItem("verifier");
		const params = new URLSearchParams();
		params.append("client_id", clientId);
		params.append("grant_type", "authorization_code");
		params.append("code", code);
		params.append("redirect_uri", redirectUri);
		params.append("code_verifier", verifier);

		const result = await fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: params
		});

		const { access_token, expires_in } = await result.json();
		let expDate = new Date();

		let cache = {
			token:access_token, 
			expiration: expDate.setSeconds(expDate.getSeconds() + expires_in)
		}
		sessionStorage.setItem('accessTokenCache', JSON.stringify(cache));

		return access_token;
	},
	getArtistForTrack(artists) {
		let names = artists.map(a => {
			return a.name;
		});
		return this.combiner.format(names);
	},
	getCachedToken() {
		let cache = sessionStorage.getItem('accessTokenCache');
		if(!cache) return;
		console.log('at cache did exist');
		cache = JSON.parse(cache);
		let now = new Date();
		if(now.getTime() > cache.expiration) return;
		console.log('it was not expired');
		return cache.token;

	},
	async getData() {

		this.status = 'Loading your profile...';
		this.profile = await this.getProfile(this.accessToken);
		console.log(this.profile);
		this.status = 'Loading your music listening data...';

		let [ artists, tracks ] = await Promise.all([this.getTopItems('artists', this.accessToken), this.getTopItems('tracks', this.accessToken)]);
		this.topArtists = artists.items;
		this.topTracks = tracks.items;

		// rethink - this won't show up for more than a second
		this.status = 'Calculating your snobbery level...';

		this.avgArtistPop = (this.topArtists.reduce((pop,a) => {
			return pop + a.popularity;
		},0)) / 50;
		console.log('avgArtistPop', this.avgArtistPop);

		this.avgTrackPop = (this.topTracks.reduce((pop,a) => {
			return pop + a.popularity;
		},0)) / 50;
		console.log('avgTrackPop', this.avgTrackPop);

		this.avgAverage = (this.avgArtistPop + this.avgTrackPop) / 2;
		
		this.status = '';

	},
	async getProfile(token) {
		const result = await fetch("https://api.spotify.com/v1/me", {
			method: "GET", headers: { Authorization: `Bearer ${token}` }
		});

		return await result.json();
	},
	async getTopItems(type,token) {
		console.log('fetching top', type);
		const result = await fetch(`https://api.spotify.com/v1/me/top/${type}?limit=20`, {
			method: "GET", headers: { Authorization: `Bearer ${token}` }
		});

		return await result.json();

	},
	login() {
		this.redirectToAuthCodeFlow(clientId);
	},
	normalizeImage(url) {
		return `https://res.cloudinary.com/raymondcamden/image/fetch/c_thumb,g_north,w_250,h_200/${url}`;
	},
	async redirectToAuthCodeFlow(clientId) {
		const verifier = this.generateCodeVerifier(128);
		const challenge = await this.generateCodeChallenge(verifier);

		sessionStorage.setItem("verifier", verifier);

		const params = new URLSearchParams();
		params.append("client_id", clientId);
		params.append("response_type", "code");
		params.append("redirect_uri", redirectUri);
		params.append("scope", "user-read-private user-read-email user-top-read");
		params.append("code_challenge_method", "S256");
		params.append("code_challenge", challenge);

		document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;

	}
  }))
});

