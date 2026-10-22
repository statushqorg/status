#!/usr/bin/env bash
#
# Rotate one mailbox password, and update this app's .env.production to match.
#
# ## Why this exists
#
# statushqorg/status is a PUBLIC repository. Its first commit, ed9c15c
# (2026-07-02, "chore: initial commit"), carries .env.production with
# MAIL_PASSWORD_CHRIS, MAIL_PASSWORD_BLAKE and MAIL_PASSWORD_GLENN as plaintext
# 21-character values. They were encrypted in a later commit, which does nothing
# for the copies already in history: ed9c15c is reachable from origin/main, so
# anyone who clones has them.
#
# Rotation is the only fix. Deleting the keys, re-encrypting, or rewriting
# history all leave the exposed values valid on the mail server.
#
# Of the three, blake has no mailbox on any of the 47 accounts on the mail host,
# so there is nothing to rotate. chris and glenn both exist.
#
#   chris@statushq.org    exposed, still an active key in this repo  <- rotate first
#   chris@stacksjs.com    exists; owned elsewhere, no key in this repo
#   glenn@stacksjs.com    exists; precautionary, no key in this repo
#   glenn@wildloop.org    exists; precautionary, no key in this repo
#
# ## What it does
#
#   1. generates a 24-character password with openssl
#   2. sets it on the mail server over stdin, so it never appears in argv or ps
#   3. writes it into .env.production with `buddy env:set`, which encrypts it
#   4. verifies the key is present and encrypted, without printing the value
#
# The password is never echoed, never written to a file, and is cleared from the
# environment on exit. It does reach `buddy env:set` as an argument, which is
# visible in /proc on this machine for the life of that one call; that is the
# only gap, and it is local.
#
# ## Usage
#
#   ./scripts/rotate-mailbox-password.sh chris@statushq.org MAIL_PASSWORD_CHRIS
#   ./scripts/rotate-mailbox-password.sh glenn@stacksjs.com
#
# Second argument is the .env.production key to update. Omit it when the account
# has no key in this repo, and only the mail server is changed.
#
# Anything that authenticates as the rotated address needs the new value too.
# For chris@statushq.org that is this app, handled here. For the others, check
# whichever app owns them before rotating, or their mail stops sending.

set -euo pipefail

cd "$(dirname "$0")/.."

ADDRESS="${1:-}"
ENV_KEY="${2:-}"

if [ -z "$ADDRESS" ]; then
  echo "usage: $0 <email-address> [ENV_KEY]" >&2
  echo "example: $0 chris@statushq.org MAIL_PASSWORD_CHRIS" >&2
  exit 1
fi

if [ ! -r .env.keys ]; then
  echo "error: .env.keys is not here, so env:set cannot encrypt into .env.production." >&2
  echo "       Rotate on the mail server only, or fetch the key first." >&2
  exit 1
fi

echo "About to rotate the password for: $ADDRESS"
if [ -n "$ENV_KEY" ]; then
  echo "and update $ENV_KEY in .env.production"
else
  echo "(no .env key given, so only the mail server changes)"
fi
echo
printf 'Type the address again to confirm: '
read -r CONFIRM
[ "$CONFIRM" = "$ADDRESS" ] || { echo "aborted"; exit 1; }

# 24 chars from a 32-byte draw, punctuation stripped so it survives every env
# and config path this value passes through without quoting surprises.
PASSWORD="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | cut -c1-24)"
[ "${#PASSWORD}" -eq 24 ] || { echo "error: could not generate a password"; exit 1; }
trap 'unset PASSWORD' EXIT

echo
echo "-- setting it on the mail server"
# --password-stdin keeps it out of argv and out of ps. If the account already
# exists this updates it; if add refuses, delete the user and run this again.
printf '%s' "$PASSWORD" | ./buddy mail:user:add "$ADDRESS" --password-stdin

if [ -n "$ENV_KEY" ]; then
  echo
  echo "-- writing it into .env.production (encrypted)"
  ./buddy env:set "$ENV_KEY" "$PASSWORD" -f .env.production

  echo
  echo "-- verifying, without printing the value"
  if grep -q "^${ENV_KEY}=.*encrypted:v2" .env.production; then
    echo "   $ENV_KEY is present and encrypted"
  else
    echo "   WARNING: $ENV_KEY is missing or not encrypted. Check before committing." >&2
    exit 1
  fi
fi

echo
echo "Done. Next:"
echo "  1. commit .env.production"
echo "  2. deploy, so the box picks up the new value"
echo "  3. send a test message and confirm it still goes out"
