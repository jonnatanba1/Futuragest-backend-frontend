cd 'C:\DEV\Futuragest\backend'
pnpm exec eslint --format json `
  'src/modules/asistencia/application/check-in-attendance.use-case.spec.ts' `
  'src/modules/compensacion/application/close-compensation-period.use-case.spec.ts' `
  'src/modules/compensacion/application/close-compensation-period-zoneid.spec.ts' `
  'src/modules/compensacion/interface/compensacion.controller.spec.ts' `
  'src/modules/asistencia/interface/attendance.controller.spec.ts' 2>&1 | Out-File 'C:\DEV\Futuragest\backend\lint-batch1.json' -Encoding utf8
Write-Host done
