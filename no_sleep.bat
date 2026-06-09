@echo off
echo === Disattivo sospensione e schermo ===
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change monitor-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
echo OK - Il PC non si spengerà finché non riabiliti manualmente.
