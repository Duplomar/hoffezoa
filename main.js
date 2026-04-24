import express from "express";
import crypto from "crypto";
import fs from "fs";
import zlib from "zlib"

const app = express()
app.disable('x-powered-by');
const port = 8000

function load_taxon_tree() {
    const data = JSON.parse(fs.readFileSync("./tree_en_ncbi.json", "utf-8"))
    return [
        data["tree"],
        data["leaf_start"]
    ]
}
const [taxon_tree, animal_start_index] = load_taxon_tree()
const taxon_length = 100
const page_template = fs.readFileSync(
    "./page.html", 
    "utf-8"
).replace(
    "{{ animal_start_index }}", 
    "" + animal_start_index
).replace(
    "{{ taxon_tree }}", 
    JSON.stringify(taxon_tree)
)

let replace_time = new Date()
let expire_str = replace_time.toUTCString()

let todays_taxons = [];
let todays_animal_index = -1;
let yesterdays_animal_index = -1;

let salt = 0;
let page = "";
let page_br = "";


function create_hash(text) {
    return crypto.createHash('sha512').update(text).digest("base64")
}

function set_todays_animal(){
    salt = crypto.randomInt(2**32)
    todays_taxons = []

    let i = crypto.randomInt(animal_start_index, taxon_tree.length)
    yesterdays_animal_index = todays_animal_index
    todays_animal_index = i
    while (i) {
        const [taxon_names, parent] = taxon_tree[i]
        todays_taxons.push(taxon_names[0])
        i = parent
    }
    todays_taxons.push(taxon_tree[0][0][0])

    todays_taxons = todays_taxons.reverse().map(
        (taxon, i) =>{
            return create_hash(`${i};${salt};${taxon}`)
        }
    )
    while (todays_taxons.length < taxon_length) {
        todays_taxons.push(create_hash(crypto.randomBytes(32)))
    }

    page = page_template.replace(
        "{{ salt }}", 
        "" + salt
    ).replace(
        "{{ animal_start_index }}", 
        "" + animal_start_index
    ).replace(
        "{{ yesterdays_animal_index }}", 
        "" + yesterdays_animal_index
    ).replace(
        "{{ todays_taxons }}", 
        JSON.stringify(todays_taxons)
    ).replace(
        "{{ today }}", 
        replace_time.toISOString().split('T')[0]
    )

    page_br = zlib.brotliCompressSync(Buffer.from(page));
    replace_time.setDate(replace_time.getDate() + 1)
    expire_str = replace_time.toUTCString()
}

function schedule_new_animal(hour, minute) {
    const now = new Date();
    const next = new Date();

    next.setHours(hour, minute, 0, 0);

    if (next <= now) 
        next.setDate(next.getDate() + 1);

    replace_time = next
    expire_str = replace_time.toUTCString()

    const delay = next - now;
    setTimeout( 
        () => {
            set_todays_animal();
            setInterval(set_todays_animal, 24 * 60 * 60 * 1000);
        }, 
        delay
    );

}

set_todays_animal()
schedule_new_animal(0, 0)

app.get('/', (req, res) => {
    res.set('Expires', expire_str);

    const enc = req.headers['accept-encoding'] || '';
    if (enc.includes('br')) {
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Content-Encoding', 'br');
        res.set('Vary', 'Accept-Encoding');
        res.send(page_br);
    }
    else
        res.send(page)
})

app.listen(port, () => {console.log(`Metazoa running at ${port}`)})
