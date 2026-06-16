# Class Resource Hub

A GitHub-only class resource app for files, links, prompts, images, videos, topics, downloads, favorites, comments, replies, and comment likes.

## How storage works

- The app is static and can be hosted on GitHub Pages.
- Resource metadata is saved to `resource-hub/data/resources.json`.
- Uploaded files are saved to `resource-hub/uploads/`.
- Students need the shared class password to enter the hub.
- Students need a GitHub token with repository content write access to upload, comment, like, or add topics.

## Publish on GitHub Pages

1. Put this `resource-hub` folder in your GitHub repository.
2. In GitHub, open **Settings > Pages**.
3. Set the source to the branch that contains this folder.
4. Open the Pages URL and go to `/resource-hub/`.
5. Complete the first setup screen with your app name, shared password, repository, branch, data path, and GitHub token.

## Install in Chrome

After the app is published on GitHub Pages:

1. Open the app URL in Google Chrome.
2. If Chrome shows the install icon in the address bar, click it.
3. You can also use Chrome's menu and choose **Save and share > Install page as app**.
4. The app will open in its own Chrome app window, while still saving all resources to GitHub.

## Token note

Use a fine-grained GitHub personal access token scoped only to this repository with **Contents: Read and write**. The token is stored in the current browser's local storage so the app can save directly to GitHub. Do not paste a personal token into a shared or public computer.
