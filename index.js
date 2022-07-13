const nodeMailer = require("nodemailer")
const AWS = require("aws-sdk");
const csv = require("csv-parser");
const fs = require('fs')
const stream = require('stream')
const pdf = require("dynamic-html-pdf");
const path = require('path');

const Email = process.env.EMAIL
const password = process.env.PASS
const keyId = process.env.ACCESS_KEY;
const secret = process.env.SECRET_KEY;
const url = process.env.S3_URL
const BUCKET_NAME = "trello-api";

var product_id = [];
var raw_data = [];
const real_data = []
var head = [];
var header = [];   // prepare for 
var html = fs.readFileSync("./template.html", "utf8");

AWS.config.update({
  accessKeyId: keyId,
  secretAccessKey: secret,
});

process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'];
process.env['FONTCONFIG_PATH'] = path.join(process.env['LAMBDA_TASK_ROOT'], 'fonts');


console.log('Loading function');

exports.handler = (event, context) => {
      var s3 = new AWS.S3();
     
      s3.getObject(
        { Bucket: BUCKET_NAME, Key: "nine/2022-06-01.csv" },
        function (error, data) {
          console.log("Download file from S3...");
          if (error != null) {
            console.log("Failed to retrieve an object: " + error);
          } else {
            console.log("Loaded " + data.ContentLength + " bytes");
            readCSV(data.Body)
          }
        }
      );
    

      function readCSV(buff) {
        const buffer = new Buffer.from(buff, 'utf-8')
        const readable = new stream.Readable()
        readable._read = () => {} 
        readable.push(buffer)
        readable.push(null)
        readable
          .pipe(csv({}))
          .on("headers", (header) => head.push(header))
          .on("data", (data) => {
            data.id = data[Object.keys(data)[0]]
            delete(data[Object.keys(data)[0]])
            raw_data.push(data)
          })
          .on("end", () => {
            header = head[0].toString().replace(/['"]+/g, "").split(",");
            // console.log(raw_data)
            console.log("Done reading");
            getTotalPrice()
            
          });
      }
      function getTotalPrice(){
        let counts = raw_data.reduce((c, {product_code: key }) => (c[key] = (c[key] || 0) + 1, c), {});
        for (let i = 0; i<raw_data.length;i++){
          if (raw_data[i].product_code in counts){
            if (product_id.includes(raw_data[i].product_code)){
              continue
            }
            else{
            product_id.push(raw_data[i].product_code)
            real_data.push(raw_data[i])
            raw_data[i].sold = counts[raw_data[i].product_code]
            raw_data[i].total = raw_data[i].sold * raw_data[i].sold_price
          }
          }
        }
        console.log(product_id)
        createPDF()
      }

      function createPDF(){
        // Custom handlebar helper
        pdf.registerHelper("ifCond", function (v1, v2, options) {
          if (v1 === v2) {
            return options.fn(this);
          }
          return options.inverse(this);
        });
        var options = {
          format: "A4",
          orientation: "portrait",
          border: "10mm",
          phantomPath: './node_modules/phantomjs-prebuilt/lib/phantom/bin/phantomjs',
          timeout: '150000'
        };
        
        var document = {
          type: "buffer", // 'file' or 'buffer'
          template: html,
          context: {
            headers: ['id',           'machine_id',
            'slot',                  'product_code',
            'product_name',          'product_type',
            'sold',                   'sold_price',
            'total'],
            // results: results
            results:real_data
          },
          path: "./output.pdf", // it is not required if type is buffer
        };
        
        pdf
          .create(document, options)
          .then((res) => {
            console.log("Created Pdf successfully")
            uploadFile(res,'NINE.pdf')
            sendEmail(res)
          })
          .catch((error) => {
            console.log('create error')
            console.error(error);
          });
      }
      
    async function uploadFile(file, filename) {
          // let buffers = new Buffer.from(file);
            const params = {
              Bucket: BUCKET_NAME,
              Key: filename,
              Body: file,
              ContentType: "application/pdf",
            };
            s3.upload(params, function (err, data) {
              if (err) throw err;
              else {
                console.log("file uploaded");
                // sendEmail(buffers)
              }
            });
      }


    async function sendEmail(attach){
        let transporter = nodeMailer.createTransport({
          host: 'outlook.office365.com',
          port: 587,
          secure: false,
          auth: {
              user: Email,
              pass: password
          }
      })

    let info = await transporter.sendMail({
        from: '"SATTHA KUMPALAEW" <sattha.k@sunvending.co.th>', // sender address
        to: 'sattha.k@sunvending.co.th', // list of receivers
        subject: "Hello world", // Subject line
        text: "test send email from nodejs", // plain text body
        html: '<h1>ลองส่งเมลล์ดูจ้า</h1>', // html body
        attachments:[
          {
            filename: "NINE PROJECT.pdf",
             content: attach
          }
        ]
      });

      console.log(info)
       
    }
};

