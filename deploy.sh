#!/bin/zsh
# Load environment variables from .env
if [ -f .env ]; then
  # Sourcing .env by filtering comments and exporting variables
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$SSH_DEPLOY_TARGET" ] || [ -z "$SSH_DEPLOY_PATH" ]; then
  echo "Feil: SSH_DEPLOY_TARGET eller SSH_DEPLOY_PATH er ikke satt i .env"
  exit 1
fi

# Fjern eventuell avsluttende skråstrek for konsekvent validering og bruk
SSH_DEPLOY_PATH="${SSH_DEPLOY_PATH%/}"

# Sikkerhetssjekker for SSH_DEPLOY_PATH
if [[ "$SSH_DEPLOY_PATH" == *..* ]]; then
  echo "Feil: SSH_DEPLOY_PATH kan ikke inneholde '..' (stigjennomgang/path traversal)."
  exit 1
fi

if [[ "$SSH_DEPLOY_PATH" != /* ]]; then
  echo "Feil: SSH_DEPLOY_PATH må være en absolutt bane som starter med '/'."
  exit 1
fi

# Tell antall skråstreker for å sikre at banen er dyp nok (f.eks. minst 3 ledd: /a/b/c)
SLASH_COUNT=$(echo -n "$SSH_DEPLOY_PATH" | tr -cd '/' | wc -c)
if [ "$SLASH_COUNT" -lt 3 ]; then
  echo "Feil: SSH_DEPLOY_PATH ($SSH_DEPLOY_PATH) er for grunn. Banen må ha minst 3 nivåer (f.eks. /home/bruker/snikksnakk)."
  exit 1
fi

# Blokker distribusjon til kritiske systemmapper
for bad_dir in "/" "/etc" "/var" "/home" "/usr" "/bin" "/boot" "/dev" "/lib" "/lib64" "/media" "/mnt" "/opt" "/run" "/srv" "/sys" "/tmp" "/root"; do
  if [ "$SSH_DEPLOY_PATH" = "$bad_dir" ]; then
    echo "Feil: Distribusjon direkte til den kritiske systemmappen $SSH_DEPLOY_PATH er ikke tillatt!"
    exit 1
  fi
done

echo "Bygger prosjektet..."
npm run build

if [ $? -ne 0 ]; then
  echo "Feil: Byggingen mislyktes. Avbryter distribusjon."
  exit 1
fi

# Slett hemmelige filer og maler fra dist før opplasting (hvis de ble kopiert)
rm -f dist/api/service-account.json dist/api/config.php dist/api/config.example.php dist/api/service-account.example.json

echo "Overfører filer til $SSH_DEPLOY_TARGET:$SSH_DEPLOY_PATH..."

# Try rsync first (preferred for speed, handles directory structure and deletes obsolete files safely without owner/group errors)
if command -v rsync >/dev/null 2>&1; then
  rsync -rtlz --delete --exclude='api/config.php' --exclude='api/service-account.json' --exclude='api/uploads' dist/ "$SSH_DEPLOY_TARGET:$SSH_DEPLOY_PATH/"
  RESULT=$?
else
  # Fallback to scp (cd into dist to avoid path expansion and glob issues)
  (cd dist && scp -r . "$SSH_DEPLOY_TARGET:$SSH_DEPLOY_PATH/")
  RESULT=$?
fi

if [ $RESULT -eq 0 ]; then
  echo "Distribusjon fullført med suksess!"
else
  echo "Feil: Overføring mislyktes (Exit code: $RESULT)."
  exit $RESULT
fi
