export const impColor = s =>
  s<=2?{bar:"#1d9e75",text:"#0f6e56",label:"Bajo",bg:"#e1f5ee"}:
  s<=4?{bar:"#639922",text:"#3b6d11",label:"Moderado",bg:"#eaf3de"}:
  s<=6?{bar:"#c8900a",text:"#854f0b",label:"Significativo",bg:"#fef3dc"}:
  s<=8?{bar:"#d86020",text:"#993c1d",label:"Alto",bg:"#faece7"}:
       {bar:"#a32d2d",text:"#791f1f",label:"Crítico",bg:"#fcebeb"};
