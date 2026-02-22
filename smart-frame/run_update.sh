#!/bin/bash
# script para que el scheduler invoque al agente de smart-frame correctamente

/opt/homebrew/bin/openclaw agent \
  --to +50660048606 \
  --message "Actualiza el Dashboard del smart-frame (Weather, IG, News) y súbelo al FTP y Git. Sigue las instrucciones en INSTRUCTIONS_FRAME.md" \
  --thinking low \
  --deliver
