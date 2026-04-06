#!/bin/bash
sed -i "s/'/'/g; s/'/'/g" src/App.jsx
sed -i 's/"/"/g; s/"/"/g' src/App.jsx
sed -i 's/—/--/g' src/App.jsx
npm run build
