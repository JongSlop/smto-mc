#!/bin/sh
set -e

# Applies whatever migrations the running image needs and have not landed yet,
# then re-runs the seed. The seed is written to be safe to repeat: it fills an
# empty server list and leaves existing rows alone, so it never pushes the
# checked-in defaults back over an admin's edits. That makes "run this on every
# start" the right call rather than a one-off step somebody has to remember.
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/tsx prisma/seed.ts

exec "$@"
