# Ridgefield Academy

Shared source repository: https://github.com/viviansb3-tech/Ridgefield

GitHub is the common place for code from both computers. Each computer keeps its own local copy. Changes become available to the other computer after they are committed and pushed to GitHub.

## Set up another computer

Install Git, then clone this repository into a local development folder:

```sh
git clone https://github.com/viviansb3-tech/Ridgefield.git
cd Ridgefield
```

Sign in to GitHub when prompted to push changes. Never put a GitHub token in the repository URL or in source files.

## Work between computers

Before editing on either computer:

```sh
git status
git pull --ff-only origin main
```

After finishing a set of changes:

```sh
git status
git add path/to/changed-file
git commit -m "Describe the change"
git push origin main
```

Add each intended file explicitly. Review the changes before committing. Push before switching computers, then pull on the other computer before continuing. Uncommitted changes are not transferred through GitHub.

If pulling reports local changes or conflicting histories, stop and preserve your work before resolving the conflict. Do not discard files or force-push to make the message disappear. Avoid editing the same file on both computers at the same time.

## Local preview

From the repository folder, with Python 3 installed:

```sh
python3 scripts/local_server.py --host 127.0.0.1 --port 8080
```

On Windows, use `py -3` instead of `python3` if needed. Open http://localhost:8080/ in that computer's browser. A localhost address refers only to the computer running the preview.

## Shared backend and private files

The website's Supabase connection is configured in `assets/rf-baas-config.js`. Both computers use the same hosted backend. Only the project URL and publishable key belong in that file; elevated credentials must remain in the backend environment.

The repository is public. Credentials, account-setup links, local databases, learner records, uploaded documents and generated reports must stay out of Git. The ignore rules exclude the relevant local storage and output folders. Ignored files are not transferred to the other computer.

Backend setup and service boundaries are documented in [supabase/README.md](supabase/README.md). Database and Edge Function changes must also be applied to Supabase; pushing code to GitHub alone does not deploy them. Website publication is a separate step unless an automatic deployment has been explicitly configured.
