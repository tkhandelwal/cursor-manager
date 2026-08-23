#!/usr/bin/env node

import { loadSettings, loadState, statusReport } from "./lib.mjs"

const settings = await loadSettings()
const state = await loadState()

process.stdout.write(`${statusReport(state, settings)}\n`)
