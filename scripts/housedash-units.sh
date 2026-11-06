#!/bin/bash
# Install a systemd unit from the source tree. Units are templates: @USER@, @HOME@ and @UID@
# become the account HouseDash runs as (the first user of the Pi, UID 1000).
# Usage: install_unit <source file> <unit name>
install_unit() {
  local source=$1 name=$2 rendered
  rendered=$(mktemp)
  sed -e "s#@USER@#$(id -un)#g" -e "s#@HOME@#$HOME#g" -e "s#@UID@#$(id -u)#g" "$source" > "$rendered"
  if ! sudo -n cmp -s "$rendered" "/etc/systemd/system/$name" 2>/dev/null; then
    sudo -n install -m 644 "$rendered" "/etc/systemd/system/$name"
    UNIT_CHANGED=true
  fi
  rm -f "$rendered"
}
