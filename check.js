import fetch from 'node-fetch';
import 'dotenv/config';

const res = await fetch(`${process.env.STRAPI_URL}/api/blogs`, {
  headers: { Authorization: `Bearer ${process.env.STRAPI_TOKEN}` }
});
const json = await res.json();
json.data.forEach(b => {
  console.log('\nTitle:', b.title);
  console.log('body_html:', b.body_html ? b.body_html.slice(0, 200) : 'NULL');
});
