---
title: "Reddify"
description: "Create Spotify Playlists out of Reddit Threads!"
date: "2024-12-06"
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

Once a Reddit thread is submitted, Reddify extracts the comments out of the 
post and uses the **Spotify Search API** to narrow down the song and picks the top result. 
This idea was born out of my own experiences of finding Spotify's Search pretty spot on and worked 
as well when I tried feeding it Reddit comments.

## How to use Reddify?

Reddify is archived and is no longer hosted or actively developed. The source code remains
available on [GitHub](https://github.com/roopeshvs/reddify) for anyone who wants to run it
themselves — clone the repo and follow the instructions in the README to get it up and running
locally.