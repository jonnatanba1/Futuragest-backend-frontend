const fs = require('fs');
let content = fs.readFileSync('C:/DEV/Futuragest/backend/src/modules/compensacion/interface/compensacion.controller.spec.ts', 'utf8');

// The pattern: controller.xxx(..., mockRes, or standalone mockRes,
// Replace single-arg usages on their own lines
content = content.replace(/\bmockRes\b/g, 'res');
content = content.replace(/\bmockReq\b(?!\w)/g, 'req');
content = content.replace(/\bmockReqNoSub\b/g, 'reqNoSub');
content = content.replace(/\bmockReqNullSub\b/g, 'reqNullSub');

// But now we have broken the function declarations - fix those back
content = content.replace('function makeRes()', 'function makeRes()');
content = content.replace('function makeReq(', 'function makeReq(');

// Also fix the mock jest function names that start with mock* - leave those
// Actually we may have corrupted: mockGetBalance, mockSetPolicy, etc.
// These are jest.Mock vars, not our renamed vars - but their names don't match 'mockRes' etc.
// Check: mockGetBalance, mockSetPolicy, mockGetTimeline, mockClosePeriod, mockPayout, mockConfirmPayout
// These are fine, they don't contain 'mockRes' or 'mockReq'

fs.writeFileSync('C:/DEV/Futuragest/backend/src/modules/compensacion/interface/compensacion.controller.spec.ts', content);

// Count remaining
const remaining = (content.match(/\bas any\b/g) || []).length;
const staleRes = (content.match(/\bmockRes\b/g) || []).length;
const staleReq = (content.match(/\bmockReq\b/g) || []).length;
console.log('Remaining as any:', remaining, '| mockRes:', staleRes, '| mockReq:', staleReq);
