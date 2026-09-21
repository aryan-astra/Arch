// Hand-built sanitized fixture mirroring the upstream My_Attendance page
// structure (pageSanitizer.sanitize payload → info table → attendance table
// → marks table). ALL values are fictitious and exist only to pin parser
// behavior. Never paste real upstream HTML here.

const INNER = `
<table><tbody>
<tr><td>Registration Number:</td><td>:</td><td>TEST0001</td></tr>
<tr><td>Name</td><td>:</td><td>Test Student</td></tr>
<tr><td>Program</td><td>:</td><td>B.Tech</td></tr>
<tr><td>Semester</td><td>:</td><td>3</td></tr>
</tbody></table>
<table><tbody>
<tr><th>Course Code</th><th>Course Title</th><th>Category</th><th>Faculty</th>
<th>Slot</th><th>Room</th><th>Hours Conducted</th><th>Hours Absent</th><th>Attn %</th></tr>
<tr><td>TEST101</td><td>Test Theory</td><td>Theory</td><td>Faculty One</td>
<td>A</td><td>TP 101</td><td>30</td><td>6</td><td>80.0</td></tr>
<tr><td>TEST102</td><td>Test Practical</td><td>Practical</td><td>Faculty Two</td>
<td>P1</td><td>Lab 2</td><td>20</td><td>2</td><td>90.0</td></tr>
</tbody></table>
<table><tbody>
<tr><th>Course</th><th>Title</th><th>Test Performance</th></tr>
<tr><td>TEST101</td><td>Test Theory</td><td><table><tbody>
<tr><td><strong>FT-I/5.00</strong><br>4.50</td></tr>
<tr><td><strong>FT-II/10.00</strong><br>8.00</td></tr>
</tbody></table></td></tr>
</tbody></table>
`

export const SANITIZED_ATTENDANCE_PAGE = `<html><body><script>pageSanitizer.sanitize('${INNER.replace(/\n/g, '')}')</script></body></html>`
