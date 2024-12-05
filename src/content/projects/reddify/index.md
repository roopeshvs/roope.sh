---
title: "Reddify"
description: "Create Spotify Playlists out of Reddit Threads!"
date: "04/02/2024"
# demoURL: "https://reddify.pesh.dev"
repoURL: "https://github.com/roopeshvs/reddify"
---

![Reddify](/reddify-search.png)

Reddify is a simple web utility to create a Spotify playlist out of a Reddit post's comments.

It features a minimal UI built without any javascript frameworks.

## Why I built Reddify?

Quite often, on subreddits like [r/music](https://www.reddit.com/r/Music) and [r/spotify](https://www.reddit.com/r/spotify), there are huge threads that are filled
with comments featuring great music suggestions. I used to listen to a few of the top comments and 
forget about the rest. This felt like leaving a treasure trove of new music experiences behind. 

While most of the days I stick to listening familiar tunes, there are specific days when I am
very excited about discovering new songs and having a playlist of these suggestions from Reddit
looked like a wonderful way to go about it.

## How does Reddify work?

It is very simple. Once a Reddit thread is submitted, Reddify extracts the comments out of the 
post and uses the Spotify Search API to narrow down the song and picks the top result. 
This idea was born out of my own experiences of finding Spotify's Search pretty spot on and worked 
as well when I tried feeding it Reddit comments.

## How to use Reddify?

Reddify used to be hosted on reddify.pesh.dev. Since I've not yet received Spotify's approval 
to use their API publicly, it is temporarily down at the moment. Until then, if you want to try
it out, please do so by cloning the repo, and following the instructions provided in README.